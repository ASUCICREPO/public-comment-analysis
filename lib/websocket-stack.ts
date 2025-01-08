import * as cdk from 'aws-cdk-lib';
import * as apigateway from '@aws-cdk/aws-apigatewayv2-alpha';
import * as integrations from '@aws-cdk/aws-apigatewayv2-integrations-alpha';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs';

interface WebSocketStackProps extends cdk.StackProps {
  stateTable: dynamodb.Table;
  stateMachineArn: string;
}

export class WebSocketStack extends cdk.Stack {
  public readonly webSocketApi: apigateway.WebSocketApi;
  public readonly connectionsTable: dynamodb.Table;
  public readonly progressTracker: lambda.Function;
  public readonly webSocketEndpoint: string;
  public readonly stage: apigateway.WebSocketStage;

  constructor(scope: Construct, id: string, props: WebSocketStackProps) {
    super(scope, id, props);

    // Create WebSocket API
    this.webSocketApi = new apigateway.WebSocketApi(this, 'CommentProcessorWebSocket', {
      apiName: 'CommentProcessorWebSocket',
    });

    // Create stage
    this.stage = new apigateway.WebSocketStage(this, 'DevStage', {
      webSocketApi: this.webSocketApi,
      stageName: 'dev',
      autoDeploy: true,
    });

    // Store the WebSocket endpoint
    this.webSocketEndpoint = `${this.webSocketApi.apiEndpoint}/${this.stage.stageName}`;

    // Create DynamoDB table for connections
    this.connectionsTable = new dynamodb.Table(this, 'ConnectionsTable', {
      partitionKey: {
        name: 'connectionId',
        type: dynamodb.AttributeType.STRING,
      },
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    // Create WebSocket layer
    const webSocketLayer = new lambda.LayerVersion(this, 'WebSocketLayer', {
      code: lambda.Code.fromAsset('lambda/layers/websocket'),
      compatibleRuntimes: [lambda.Runtime.PYTHON_3_9],
      description: 'WebSocket utilities layer',
    });

    // Common Lambda configuration
    const commonLambdaProps = {
      runtime: lambda.Runtime.PYTHON_3_9,
      layers: [webSocketLayer],
      environment: {
        CONNECTIONS_TABLE_NAME: this.connectionsTable.tableName,
        WEBSOCKET_API_ENDPOINT: this.webSocketEndpoint,
      },
    };

    // Create handlers
    const connectHandler = new lambda.Function(this, 'WebSocketConnectHandler', {
      ...commonLambdaProps,
      handler: 'websocket_handlers.connect_handler',
      code: lambda.Code.fromAsset('lambda/websocket'),
    });

    const disconnectHandler = new lambda.Function(this, 'WebSocketDisconnectHandler', {
      ...commonLambdaProps,
      handler: 'websocket_handlers.disconnect_handler',
      code: lambda.Code.fromAsset('lambda/websocket'),
    });

    // Create routes
    this.webSocketApi.addRoute('$connect', {
      integration: new integrations.WebSocketLambdaIntegration('ConnectIntegration', connectHandler)
    });

    this.webSocketApi.addRoute('$disconnect', {
      integration: new integrations.WebSocketLambdaIntegration('DisconnectIntegration', disconnectHandler)
    });

    // Create Progress Tracker
    this.progressTracker = new lambda.Function(this, 'ProgressTrackerHandler', {
      ...commonLambdaProps,
      handler: 'index.lambda_handler',
      code: lambda.Code.fromAsset('lambda/progress-tracker'),
      environment: {
        ...commonLambdaProps.environment,
        STATE_TABLE_NAME: props.stateTable.tableName,
      },
    });

    // Create EventBridge rule
    const stateMachineRule = new events.Rule(this, 'StateMachineStateChangeRule', {
      eventPattern: {
        source: ['aws.states'],
        detailType: ['Step Functions Execution Status Change'],
        detail: {
          stateMachineArn: [props.stateMachineArn]
        },
      },
    });

    stateMachineRule.addTarget(new targets.LambdaFunction(this.progressTracker));

    // Grant permissions
    this.connectionsTable.grantReadWriteData(connectHandler);
    this.connectionsTable.grantReadWriteData(disconnectHandler);
    this.connectionsTable.grantReadWriteData(this.progressTracker);
    props.stateTable.grantReadWriteData(this.progressTracker);

    // Grant WebSocket management permissions - critical fix here
    const webSocketPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'execute-api:ManageConnections',
        'execute-api:Invoke'
      ],
      resources: [
        // The complete set of required permissions for WebSocket operations
        `arn:aws:execute-api:${this.region}:${this.account}:${this.webSocketApi.apiId}/${this.stage.stageName}/POST/@connections/*`,
        `arn:aws:execute-api:${this.region}:${this.account}:${this.webSocketApi.apiId}/${this.stage.stageName}/GET/@connections/*`,
        `arn:aws:execute-api:${this.region}:${this.account}:${this.webSocketApi.apiId}/${this.stage.stageName}/DELETE/@connections/*`,
        `arn:aws:execute-api:${this.region}:${this.account}:${this.webSocketApi.apiId}/${this.stage.stageName}/@connections/*`,
        `arn:aws:execute-api:${this.region}:${this.account}:${this.webSocketApi.apiId}/${this.stage.stageName}/*`
      ]
    });

    this.progressTracker.addToRolePolicy(webSocketPolicy);

    // Export outputs
    new cdk.CfnOutput(this, 'WebSocketEndpoint', {
      value: this.webSocketEndpoint,
      description: 'WebSocket API Endpoint',
      exportName: 'WebSocketEndpoint',
    });
  }
}