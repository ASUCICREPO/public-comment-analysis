import * as cdk from 'aws-cdk-lib';
import { PublicCommentAnalysisStack } from '../lib/public-comment-analysis-stack';
import { WebSocketStack } from '../lib/websocket-stack';
import { RestApiStack } from '../lib/rest-api-stack';
import { TestLambdaStack } from '../lib/test-lambda-stack';
import { ClusteringStack } from '../lib/clustering-stack';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
}

// Create the main stack for comment processing
const publicCommentAnalysisStack = new PublicCommentAnalysisStack(app, 'PublicCommentAnalysisStack', {
  apiKeySecretName: 'regulations-gov-api-key',
  maxConcurrentWorkers: 4,
  lambdaMemorySize: 1024,
  maxTimeout: cdk.Duration.minutes(15),
  env,
  tags: {
    Project: 'USDA Comment Processing',
    Environment: 'Development',
  },
  clusteringBucketName: `clustering-${process.env.CDK_DEFAULT_ACCOUNT}-${process.env.CDK_DEFAULT_REGION}`,
});

// Create the WebSocket stack with clustering state machine ARN
const webSocketStack = new WebSocketStack(app, 'WebSocketStack', {
  stateTable: publicCommentAnalysisStack.stateTable,
  stateMachineArn: publicCommentAnalysisStack.stateMachine.stateMachineArn,
  env
});

// Create the clustering stack
const clusteringStack = new ClusteringStack(app, 'ClusteringStack', {
  outputBucketName: publicCommentAnalysisStack.outputBucketName,
  stateMachineArn: publicCommentAnalysisStack.stateMachine.stateMachineArn,
  stateTable: publicCommentAnalysisStack.stateTable,
  webSocketEndpoint: webSocketStack.webSocketEndpoint,
  connectionsTable: webSocketStack.connectionsTable,
  webSocketApi: webSocketStack.webSocketApi,
  stageName: 'dev',
  apiGatewayEndpoint: `https://${webSocketStack.webSocketApi.apiId}.execute-api.${process.env.CDK_DEFAULT_REGION}.amazonaws.com/dev`,
  env,
  tags: {
    Project: 'USDA Comment Processing',
    Environment: 'Development',
  }
});

// Create the REST API stack with clustering bucket name
const restApiStack = new RestApiStack(app, 'RestApiStack', {
  stateMachine: publicCommentAnalysisStack.stateMachine,
  stateTable: publicCommentAnalysisStack.stateTable,
  webSocketEndpoint: webSocketStack.webSocketEndpoint,
  clusteringBucketName: clusteringStack.clusteringBucketName,
  env
});

// Create the test stack
const testStack = new TestLambdaStack(app, 'TestLambdaStack', {
  apiEndpoint: restApiStack.apiUrl,
  webSocketEndpoint: webSocketStack.webSocketEndpoint,
  env
});

// Add dependencies
clusteringStack.addDependency(publicCommentAnalysisStack);
testStack.addDependency(restApiStack);
restApiStack.addDependency(webSocketStack);
restApiStack.addDependency(publicCommentAnalysisStack);

app.synth();