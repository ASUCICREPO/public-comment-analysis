import json
import boto3
import os
import logging
import pandas as pd
from datetime import datetime, timezone
from botocore.exceptions import ClientError
from websocket_utils import create_websocket_service

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

s3_client = boto3.client("s3")
bedrock_client = boto3.client("bedrock-runtime", region_name="us-west-2")

def extract_document_id(object_key: str) -> str:
    """Extract document ID from the object key."""
    try:
        # Expected format: after-clustering/clustered_results_DOCUMENT-ID_timestamp.csv
        parts = object_key.split('results_')[1].split('_')[0]
        return parts
    except Exception:
        return None

def update_processing_state(document_id: str, status: str, error: str = None) -> None:
    """Update processing state in DynamoDB"""
    try:
        dynamodb = boto3.resource('dynamodb')
        state_table = dynamodb.Table(os.environ['STATE_TABLE_NAME'])
        
        state = {
            'status': status,
            'stage': 'analysis',
            'progress': 100 if status == 'SUCCEEDED' else 90,
            'lastUpdated': datetime.now(timezone.utc).isoformat()
        }
        
        if error:
            state['error'] = error
            
        state_table.update_item(
            Key={
                'documentId': document_id,
                'chunkId': 'metadata'
            },
            UpdateExpression='SET #state = :state',
            ExpressionAttributeNames={
                '#state': 'state'
            },
            ExpressionAttributeValues={
                ':state': json.dumps(state)
            }
        )
    except Exception as e:
        logger.error(f"Error updating state: {str(e)}")

def send_progress_update(document_id: str, status: str, error: str = None) -> None:
    """Send analysis progress update via WebSocket"""
    try:
        # Initialize WebSocket service
        ws_endpoint = os.environ.get('WEBSOCKET_API_ENDPOINT')
        api_endpoint = os.environ.get('API_GATEWAY_ENDPOINT')
        connections_table = os.environ.get('CONNECTIONS_TABLE_NAME')

        ws_service = create_websocket_service(
            endpoint=api_endpoint or ws_endpoint,
            connections_table_name=connections_table
        )
        
        if ws_service:
            ws_service.broadcast_message({
                'type': 'PROGRESS_UPDATE',
                'documentId': document_id,
                'stage': 'analysis',
                'status': status,
                'progress': 100 if status == 'SUCCEEDED' else 90,
                'error': error,
                'timestamp': datetime.now(timezone.utc).isoformat()
            })
    except Exception as e:
        logger.error(f"Error sending WebSocket update: {str(e)}")

def invoke_bedrock(prompt, model_id="anthropic.claude-3-5-sonnet-20241022-v2:0", max_length=2048):
    """Invoke Bedrock model with error handling"""
    try:
        request_body = json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": max_length,
            "temperature": 0.1,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": prompt
                        }
                    ]
                }
            ]
        })

        response = bedrock_client.invoke_model(
            modelId=model_id,
            body=request_body
        )
        
        model_response = json.loads(response["body"].read())
        return model_response["content"][0]["text"].strip()
        
    except Exception as e:
        logger.error(f"Error invoking Bedrock: {str(e)}")
        raise

def build_prompt(clusters_data):
    """
    Builds a strict JSON prompt for cluster-level analysis.
    We ONLY want the final JSON with these keys:
      clusters -> [
         {
           clusterName,
           clusterDescription,
           overallSentiment,
           repOrg,
           recActions,
           relComments
         }
      ]
    No extra commentary or text.
    We also instruct that each cluster must appear, no merging or omission.
    """
    # Provide example JSON structure up front
    example_json_structure = """
    {
    "clusters": [
        {
        "clusterName": "Worker Safety Standards",
        "clusterDescription": "Describes the main theme or focus of this cluster.",
        "overallSentiment": "Positive",
        "repOrg": ["Southern Poverty Law Center", "Farmworker Justice"],
        "recActions": ["Withdraw proposed rule", "Implement safety standards"],
        "relComments": ["comment1", "comment2", "comment3"]
        },
        {
        "clusterName": "Economic Impact",
        "clusterDescription": "Describes how new regulations might affect the economy.",
        "overallSentiment": "Neutral",
        "repOrg": ["American Farm Bureau Federation"],
        "recActions": ["Conduct economic impact assessment", "Delay implementation"],
        "relComments": ["comment1", "comment2", "comment3"]
        }
    ]
    }
    """
    # Build a text snippet listing each cluster and sampled comments
    snippet = ""
    for cluster_info in clusters_data:
        cluster_id = cluster_info["cluster_name"]
        sample_comments = cluster_info["sample_comments"]
        snippet += f"Cluster: {cluster_id}\n"
        snippet += "Sample Comments:\n"
        for c in sample_comments:
            snippet += f" - {c}\n"
        snippet += "\n"
    num_clusters = len(clusters_data)
    # Final prompt to the model
    prompt = f"""
        You are an LLM that produces STRICT JSON ONLY, nothing else.
        Your output must match exactly this structure with ALL clusters included.
        You have EXACTLY {num_clusters} clusters. You MUST produce the same number of cluster objects. 
        You must NOT merge, combine, or omit any cluster. 
        If the user has 9 clusters, output 9 clusters in the final JSON.
        Here is the desired JSON format (an example):
        {example_json_structure}
        For each cluster, fill in:
        - clusterName
        - clusterDescription (a concise summary of the cluster)
        - overallSentiment: choose "Positive", "Neutral", or "Negative"
        - repOrg: list of representative organizations or stakeholders
        - recActions: recommended actions or changes
        - relComments: a short curated subset of sample comments from that cluster
        Below is the data you have:
        {snippet}
        Return ONLY valid JSON in the final answer. 
        IMPORTANT: You must produce an array of {num_clusters} cluster objects. Do not add extra commentary or text.
        """
    return prompt

def lambda_handler(event, context):
    """Process clustered results and generate analysis"""
    document_id = None
    try:
        record = event["Records"][0]
        bucket_name = record["s3"]["bucket"]["name"]
        object_key = record["s3"]["object"]["key"]
        
        # Extract document ID
        document_id = extract_document_id(object_key)
        if not document_id:
            raise ValueError(f"Could not extract document ID from key: {object_key}")
            
        # Send initial progress update
        send_progress_update(document_id, 'RUNNING')
        update_processing_state(document_id, 'RUNNING')

        logger.info(f"Processing analysis for document {document_id}")
        logger.info(f"Processing file: s3://{bucket_name}/{object_key}")

        # Download and process CSV
        local_csv_path = f"/tmp/{os.path.basename(object_key)}"
        s3_client.download_file(bucket_name, object_key, local_csv_path)
        
        df = pd.read_csv(local_csv_path)
        
        # Group and sample comments for each cluster
        cluster_data_list = []
        grouped = df.groupby("kmeans_cluster_id")
        for cluster_id, grp in grouped:
            sample_count = min(5, len(grp))
            sample_df = grp.sample(n=sample_count) if sample_count > 0 else grp
            sample_comments = sample_df["comment_text"].tolist()

            cluster_data_list.append({
                "cluster_name": f"Cluster_{cluster_id}",
                "sample_comments": sample_comments
            })

        # Generate analysis with Bedrock
        prompt = build_prompt(cluster_data_list)
        analysis_text = invoke_bedrock(prompt)
        
        try:
            analysis_json = json.loads(analysis_text)
        except json.JSONDecodeError:
            raise ValueError("Failed to parse Bedrock response as JSON")

        # Save analysis JSON
        json_key = f"analysis-json/comments_{document_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        s3_client.put_object(
            Bucket=bucket_name,
            Key=json_key,
            Body=json.dumps(analysis_json, indent=2),
            ContentType="application/json"
        )

        logger.info(f"Analysis complete. Saved to s3://{bucket_name}/{json_key}")
        
        # Update state and send final progress update
        update_processing_state(document_id, 'SUCCEEDED')
        send_progress_update(document_id, 'SUCCEEDED')

        return {
            "statusCode": 200,
            "body": json.dumps({
                "message": "Analysis completed successfully",
                "documentId": document_id,
                "analysisLocation": f"s3://{bucket_name}/{json_key}",
                "clusters": len(cluster_data_list),
                "analysisJson": analysis_json  # Include the actual analysis in response
            }),
            "headers": {
                "Content-Type": "application/json"
            }
        }

    except Exception as e:
        logger.error(f"Error in analysis: {str(e)}", exc_info=True)
        if document_id:
            update_processing_state(document_id, 'FAILED', str(e))
            send_progress_update(document_id, 'FAILED', str(e))
        
        return {
            "statusCode": 500,
            "body": json.dumps({
                "error": str(e),
                "message": "Analysis failed",
                "documentId": document_id if document_id else "unknown"
            }),
            "headers": {
                "Content-Type": "application/json"
            }
        }