import * as cdk from 'aws-cdk-lib';
import * as apigateway from '@aws-cdk/aws-apigatewayv2-alpha';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecr_assets from 'aws-cdk-lib/aws-ecr-assets';
import * as path from 'path';
import { Construct } from 'constructs';

export interface ClusteringStackProps extends cdk.StackProps {
  outputBucketName: string;
  stateMachineArn: string;
  stateTable: dynamodb.Table;
  webSocketEndpoint: string;
  apiGatewayEndpoint: string;
  connectionsTable: dynamodb.Table;
  webSocketApi: apigateway.WebSocketApi;
  stageName: string;
  processingImage: ecr_assets.DockerImageAsset;
  ecrRepository: ecr.Repository;
}

export class ClusteringStack extends cdk.Stack {
  public readonly clusteringBucket: s3.Bucket;
  public readonly clusteringBucketName: string;

  constructor(scope: Construct, id: string, props: ClusteringStackProps) {
    super(scope, id, props);

    // Create S3 bucket for clustering pipeline
    this.clusteringBucket = new s3.Bucket(this, 'ClusteringBucket', {
      bucketName: `clustering-${this.account}-${this.region}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      lifecycleRules: [
        {
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(30),
            },
          ],
        },
      ],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.clusteringBucketName = this.clusteringBucket.bucketName;

    new s3deploy.BucketDeployment(this, 'ProcessingScriptDeployment', {
      sources: [
        s3deploy.Source.asset('docker/sagemaker-processing', {
          exclude: [
            '*',
            '!processing_script.py'  // Only include the processing script
          ]
        })
      ],
      destinationBucket: this.clusteringBucket,
      destinationKeyPrefix: 'process'
    });

    // Create SageMaker execution role
    const sagemakerRole = new iam.Role(this, 'SageMakerExecutionRole', {
      assumedBy: new iam.ServicePrincipal('sagemaker.amazonaws.com'),
      description: 'Execution role for SageMaker processing jobs',
      roleName: `sagemaker-processing-role-${this.account}`
    });

    // Add required managed policies
    sagemakerRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSageMakerFullAccess')
    );

    // Grant S3 permissions to SageMaker role
    this.clusteringBucket.grantReadWrite(sagemakerRole);
    
    // Grant comprehensive S3 permissions explicitly
    sagemakerRole.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: [
        's3:GetObject',
        's3:PutObject',
        's3:ListBucket',
        's3:DeleteObject',
        's3:GetObjectVersion'
      ],
      resources: [
        this.clusteringBucket.bucketArn,
        `${this.clusteringBucket.bucketArn}/*`
      ],
    }));

    // Add ECR permissions to SageMaker role
    sagemakerRole.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: [
        'ecr:GetAuthorizationToken',
        'ecr:BatchCheckLayerAvailability',
        'ecr:GetDownloadUrlForLayer',
        'ecr:BatchGetImage'
      ],
      resources: ['*']  // GetAuthorizationToken requires * resource
    }));
    
    // Add CloudWatch Logs permissions
    sagemakerRole.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents'
      ],
      resources: ['*']
    }));

    const sagemakerPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'sagemaker:CreateProcessingJob',
        'sagemaker:DescribeProcessingJob',
        'sagemaker:StopProcessingJob',
        'sagemaker:ListProcessingJobs',
        'sagemaker:AddTags',  // Add permission for tagging
        'sagemaker:DeleteTags'
      ],
      resources: [
        `arn:aws:sagemaker:${this.region}:${this.account}:processing-job/*`
      ]
    });

    // Create base Lambda role
    const baseLambdaRole = new iam.Role(this, 'ClusteringLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Base role for clustering Lambda functions',
    });

    // Add required policies to Lambda role
    baseLambdaRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
    );
    this.clusteringBucket.grantReadWrite(baseLambdaRole);
    
    // Add SageMaker permissions
    baseLambdaRole.addToPolicy(new iam.PolicyStatement({
      actions: ['sagemaker:CreateProcessingJob'],
      resources: ['*'],
    }));

    // Add PassRole permission for SageMaker role
    baseLambdaRole.addToPolicy(new iam.PolicyStatement({
      actions: ['iam:PassRole'],
      resources: [sagemakerRole.roleArn],
      conditions: {
        'StringLike': {
          'iam:PassedToService': 'sagemaker.amazonaws.com'
        }
      }
    }));

    // Add Bedrock permissions
    baseLambdaRole.addToPolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: ['*'],
    }));

    const webSocketLayer = new lambda.LayerVersion(this, 'WebSocketLayer', {
      code: lambda.Code.fromAsset('lambda/layers/websocket'),
      compatibleRuntimes: [lambda.Runtime.PYTHON_3_9],
      description: 'WebSocket utilities layer',
    });

    // Create processing Lambda
    const processingLambda = new lambda.Function(this, 'ProcessingLambda', {
      runtime: lambda.Runtime.PYTHON_3_9,
      code: lambda.Code.fromAsset('lambda/clustering-processor'),
      handler: 'index.lambda_handler',
      role: baseLambdaRole,
      timeout: cdk.Duration.minutes(5),
      memorySize: 1024,
      environment: {
        IMAGE_URI: props.processingImage.imageUri,
        ROLE_ARN: sagemakerRole.roleArn,
        STATE_TABLE_NAME: props.stateTable.tableName,
        WEBSOCKET_API_ENDPOINT: props.webSocketEndpoint,
        API_GATEWAY_ENDPOINT: props.apiGatewayEndpoint,
        CONNECTIONS_TABLE_NAME: props.connectionsTable.tableName
      },
      layers: [webSocketLayer],
    });

    processingLambda.addToRolePolicy(sagemakerPolicy);
    
    props.stateTable.grantReadWriteData(processingLambda);
    props.connectionsTable.grantReadWriteData(processingLambda);

    // Explicit permissions for Scan operation
    processingLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:Scan',
        'dynamodb:UpdateItem'
      ],
      resources: [
        props.connectionsTable.tableArn,
        props.stateTable.tableArn
      ]
    }));

    // Add WebSocket management permissions to Lambda role
    processingLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'execute-api:ManageConnections',
        'execute-api:Invoke'
      ],
      resources: [
        // Specific POST permission for managing connections
        `arn:aws:execute-api:${this.region}:${this.account}:${props.webSocketApi.apiId}/${props.stageName}/POST/@connections/*`,
        // Specific GET permission for getting connection info
        `arn:aws:execute-api:${this.region}:${this.account}:${props.webSocketApi.apiId}/${props.stageName}/GET/@connections/*`,
        // Specific DELETE permission for cleaning up connections
        `arn:aws:execute-api:${this.region}:${this.account}:${props.webSocketApi.apiId}/${props.stageName}/DELETE/@connections/*`,
        // General permissions for the stage
        `arn:aws:execute-api:${this.region}:${this.account}:${props.webSocketApi.apiId}/${props.stageName}/*`
      ]
    }));

    // Create analysis Lambda
    // Create a layer for the Python dependencies
    const analysisLayer = new lambda.LayerVersion(this, 'AnalysisLayer', {
      code: lambda.Code.fromAsset('lambda/clustering-analyzer', {
        bundling: {
          image: lambda.Runtime.PYTHON_3_9.bundlingImage,
          command: [
            'bash', '-c',
            'pip install --target /asset-output/python -r requirements.txt'
          ],
          user: 'root'
        }
      }),
      compatibleRuntimes: [lambda.Runtime.PYTHON_3_9],
      description: 'Dependencies for analysis lambda',
    });

    const analysisLambda = new lambda.Function(this, 'AnalysisLambda', {
      runtime: lambda.Runtime.PYTHON_3_9,
      code: lambda.Code.fromAsset('lambda/clustering-analyzer'),
      handler: 'index.lambda_handler',
      role: baseLambdaRole,
      layers: [webSocketLayer, analysisLayer],
      timeout: cdk.Duration.minutes(5),
      memorySize: 1024,
      environment: {
        STATE_TABLE_NAME: props.stateTable.tableName,
        WEBSOCKET_API_ENDPOINT: props.webSocketEndpoint,
        API_GATEWAY_ENDPOINT: props.apiGatewayEndpoint,
        CONNECTIONS_TABLE_NAME: props.connectionsTable.tableName
      },
    });

    props.stateTable.grantReadWriteData(analysisLambda);
    props.connectionsTable.grantReadWriteData(analysisLambda);

    // Explicit permissions for Scan operation
    analysisLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:Scan',
        'dynamodb:UpdateItem'
      ],
      resources: [
        props.connectionsTable.tableArn,
        props.stateTable.tableArn
      ]
    }));

    // Add WebSocket management permissions to Lambda role
    analysisLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'execute-api:ManageConnections',
        'execute-api:Invoke'
      ],
      resources: [
        // Specific POST permission for managing connections
        `arn:aws:execute-api:${this.region}:${this.account}:${props.webSocketApi.apiId}/${props.stageName}/POST/@connections/*`,
        // Specific GET permission for getting connection info
        `arn:aws:execute-api:${this.region}:${this.account}:${props.webSocketApi.apiId}/${props.stageName}/GET/@connections/*`,
        // Specific DELETE permission for cleaning up connections
        `arn:aws:execute-api:${this.region}:${this.account}:${props.webSocketApi.apiId}/${props.stageName}/DELETE/@connections/*`,
        // General permissions for the stage
        `arn:aws:execute-api:${this.region}:${this.account}:${props.webSocketApi.apiId}/${props.stageName}/*`
      ]
    }));

    // Add S3 triggers
    // Trigger processing Lambda when files are added to before-clustering/
    this.clusteringBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(processingLambda),
      { 
        prefix: 'before-clustering/',
        suffix: '.csv'
      }
    );

    // Add environment variables for processing
    processingLambda.addEnvironment('CLUSTERING_BUCKET', this.clusteringBucketName);
    processingLambda.addEnvironment('INPUT_PREFIX', 'before-clustering');
    processingLambda.addEnvironment('OUTPUT_PREFIX', 'after-clustering');

    // Trigger analysis Lambda when files are added to after-clustering/
    this.clusteringBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(analysisLambda),
      { prefix: 'after-clustering/' }
    );

    // Add outputs
    new cdk.CfnOutput(this, 'ClusteringBucketName', {
      value: this.clusteringBucketName,
      description: 'Name of the clustering pipeline bucket',
      exportName: 'ClusteringBucketName',
    });
  }
}