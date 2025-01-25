import json
import os
import boto3
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

# Set up logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
stepfunctions = boto3.client('stepfunctions')
dynamodb = boto3.resource('dynamodb')
s3_client = boto3.client('s3')
state_table = dynamodb.Table(os.environ['STATE_TABLE_NAME'])

def create_response(status_code: int, body: Dict[str, Any]) -> Dict[str, Any]:
    """Create standardized API response with CORS headers"""
    logger.debug(f"Creating response with status {status_code} and body: {body}")
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        'body': json.dumps(body)
    }

def get_analysis_json(document_id: str, cluster_bucket: str) -> Optional[Dict[str, Any]]:
    """Retrieve analysis JSON from clustering bucket if available."""
    try:
        # Look for analysis JSON file
        response = s3_client.list_objects_v2(
            Bucket=cluster_bucket,
            Prefix=f"analysis-json/comments_{document_id}"
        )
        
        if 'Contents' in response:
            # Get the latest analysis file
            latest_file = max(response['Contents'], key=lambda x: x['LastModified'])
            file_content = s3_client.get_object(
                Bucket=cluster_bucket,
                Key=latest_file['Key']
            )
            return json.loads(file_content['Body'].read().decode('utf-8'))
    except Exception as e:
        logger.warning(f"Error retrieving analysis JSON: {str(e)}")
    return None

def submit_document_for_processing(document_id: str) -> Dict[str, Any]:
    """Submit a single document for processing"""
    logger.info(f"Processing submission for document ID: {document_id}")
    
    try:
        # Initialize state in DynamoDB
        current_time = datetime.now(timezone.utc)
        initial_state = {
            'status': 'QUEUED',
            'progress': 0,
            'stage': 'comment_processing',
            'startTime': current_time.isoformat(),
            'lastUpdated': current_time.isoformat()
        }
        
        state_table.put_item(
            Item={
                'documentId': document_id,
                'chunkId': 'metadata',
                'state': json.dumps(initial_state),
                'ttl': int(current_time.timestamp()) + (7 * 24 * 60 * 60)  # 7 days TTL
            }
        )
        logger.info(f"Successfully initialized state for document {document_id}")
        
        # Start Step Functions execution
        execution = stepfunctions.start_execution(
            stateMachineArn=os.environ['STATE_MACHINE_ARN'],
            input=json.dumps({
                'documentId': document_id
            })
        )
        
        logger.info(f"Successfully started execution for document {document_id}")
        logger.debug(f"Execution ARN: {execution['executionArn']}")
        
        return {
            'documentId': document_id,
            'executionArn': execution['executionArn'],
            'status': 'QUEUED'
        }
        
    except Exception as e:
        logger.error(f"Error processing document {document_id}", exc_info=True)
        return {
            'documentId': document_id,
            'error': str(e),
            'status': 'FAILED'
        }

def handle_submission(event: Dict[str, Any]) -> Dict[str, Any]:
    """Handle new document submission"""
    logger.info("Processing new document submission")
    
    try:
        body = json.loads(event['body'])
        document_ids = body.get('documentIds', [])
        
        if not document_ids or not isinstance(document_ids, list):
            logger.warning("Invalid submission: Missing or invalid document IDs")
            return create_response(400, {'error': 'Invalid document IDs'})
        
        logger.info(f"Processing submission for {len(document_ids)} documents")
        logger.debug(f"Document IDs: {document_ids}")
        
        results = [submit_document_for_processing(doc_id) for doc_id in document_ids]
        
        successful = len([r for r in results if r['status'] == 'QUEUED'])
        failed = len([r for r in results if r['status'] == 'FAILED'])
        logger.info(f"Submission complete: {successful} successful, {failed} failed")
        
        return create_response(200, {
            'message': 'Processing started',
            'results': results
        })
        
    except json.JSONDecodeError as e:
        logger.error("Failed to parse request body", exc_info=True)
        return create_response(400, {'error': 'Invalid JSON in request body'})
    except Exception as e:
        logger.error("Unexpected error in submission handler", exc_info=True)
        return create_response(500, {'error': 'Internal server error'})

def handle_status_check(event: Dict[str, Any]) -> Dict[str, Any]:
    """Handle document status check"""
    document_id = event['pathParameters']['documentId']
    logger.info(f"Checking status for document: {document_id}")
    
    try:
        # Get status from DynamoDB
        response = state_table.get_item(
            Key={
                'documentId': document_id,
                'chunkId': 'metadata'
            }
        )
        
        if 'Item' not in response:
            logger.warning(f"Document not found: {document_id}")
            return create_response(404, {'error': 'Document not found'})
        
        state = json.loads(response['Item']['state'])
        logger.info(f"Retrieved status for document {document_id}: {state['status']}")
        
        response_body = {
            'documentId': document_id,
            'status': state
        }
        
        # Get clustering analysis if final stage is complete
        cluster_bucket = os.environ.get('CLUSTERING_BUCKET')
        if (cluster_bucket and 
            state.get('stage') == 'analysis' and 
            state['status'] == 'SUCCEEDED' and 
            state.get('progress', 0) >= 100):
            
            analysis = get_analysis_json(document_id, cluster_bucket)
            if analysis:
                response_body['analysis'] = analysis
        
        return create_response(200, response_body)
        
    except Exception as e:
        logger.error(f"Error checking status for document {document_id}", exc_info=True)
        return create_response(500, {'error': 'Error checking document status'})

def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """Handle document submission and status checking"""
    logger.info("Request received")
    
    try:
        if event['httpMethod'] == 'POST':
            return handle_submission(event)
        elif event['httpMethod'] == 'GET':
            return handle_status_check(event)
        else:
            logger.warning(f"Unsupported HTTP method: {event['httpMethod']}")
            return create_response(400, {'error': 'Unsupported method'})
            
    except Exception as e:
        logger.error("Unhandled error in lambda_handler", exc_info=True)
        return create_response(500, {'error': 'Internal server error'})