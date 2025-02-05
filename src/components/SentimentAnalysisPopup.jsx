import React, { useState } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import Timeline from "@mui/lab/Timeline";
import TimelineItem from "@mui/lab/TimelineItem";
import TimelineSeparator from "@mui/lab/TimelineSeparator";
import TimelineConnector from "@mui/lab/TimelineConnector";
import TimelineContent from "@mui/lab/TimelineContent";
import TimelineDot from "@mui/lab/TimelineDot";
import FastfoodIcon from "@mui/icons-material/Fastfood";
import Button from "@mui/material/Button";
import { Stack } from "@mui/material";
import moodempty from "../assets/moodempty.svg";
import moodhappy from "../assets/moodhappy.svg";
import moodsad from "../assets/moodsad.svg";
import commenticon from "../assets/commenticon.svg";

function SentimentAnalysisPopup({ document, onClose, increaseZIndex, zIndex }) {
  const [elevation, setElevation] = useState(10);
  const bringToTop = () => {
    setElevation((prev) => {
      return prev++;
    });
  };
  return (
    <Paper
      elevation={3}
      sx={{
        position: "fixed",
        right: 20 + 150 * document.index,
        bottom: 0,
        minWidth: "50%",
        width: "fit-content",
        zIndex: zIndex,
        maxHeight: "calc(100% - 40px)",
        display: "flex",
        flexDirection: "column",
        gap: 2,
        borderRadius: 2,
      }}
      className="sentimentAnalysisPopup"
    >
      <Stack spacing={3} onClick={increaseZIndex} sx={{ width: "-webkit-fill-available" }}>
        {/* Header */}
        <Box display="flex" justifyContent="space-between" alignItems="center" className="sentimentAnalysisHeader">
          <Typography variant="h6" className="sentimentAnalysisDocumentTitle">
            {document.id}
          </Typography>
          <IconButton size="small" onClick={() => onClose(document.id)} className="sentimentAnalysisCloseIcon">
            <CloseIcon />
          </IconButton>
        </Box>

        <Stack spacing={3} sx={{ overflow: "auto", height: "85vh" }}>
          {/* Community Sentiment Section */}

          <Stack pl={3} pr={3}>
            <Typography variant="body1" className="communitySentimentTitle">
              Community Sentiment Clusters
            </Typography>
            <Typography variant="body2" sx={{ color: getSentimentColor(document.overallSentiment) }} className="communitySentimentResult">
              {document.overallSentiment}
            </Typography>
          </Stack>
          <Stack pl={3} pr={3} spacing={1} direction={"column"}>
            <Stack spacing={0.5} direction={"row"}>
              {/* <Box display="flex" alignItems="center" gap={2}> */}
              <Box
                sx={{
                  height: 24,
                  borderRadius: 1,
                  background: sentimentColors.negative,
                  width: `${(document.negativeSentimentCount / (document.negativeSentimentCount + document.neutralSentimentCount + document.positiveSentimentCount)) * 100}%`,
                }}
              ></Box>
              <Box
                sx={{
                  height: 24,
                  borderRadius: 1,
                  background: sentimentColors.neutral,
                  width: `${(document.neutralSentimentCount / (document.negativeSentimentCount + document.neutralSentimentCount + document.positiveSentimentCount)) * 100}%`,
                }}
              ></Box>
              <Box
                sx={{
                  height: 24,
                  borderRadius: 1,
                  background: sentimentColors.positive,
                  width: `${(document.positiveSentimentCount / (document.negativeSentimentCount + document.neutralSentimentCount + document.positiveSentimentCount)) * 100}%`,
                }}
              ></Box>
            </Stack>
            <Stack>
              <Box display="flex" alignItems="center" gap={8}>
                <Stack>
                  <Typography className="sentimentCountHeader">Negative</Typography>
                  <Stack direction={"row"}>
                    <img src={moodsad} alt="Negative" height={32} />
                    <Typography className="sentimentCount">{document.negativeSentimentCount}</Typography>
                  </Stack>
                </Stack>
                <Stack>
                  <Typography className="sentimentCountHeader">Neutral</Typography>
                  <Stack direction={"row"}>
                    <img src={moodempty} alt="Neutral" height={32} />
                    <Typography className="sentimentCount">{document.neutralSentimentCount}</Typography>
                  </Stack>
                </Stack>
                <Stack>
                  <Typography className="sentimentCountHeader">Positive</Typography>
                  <Stack direction={"row"}>
                    <img src={moodhappy} alt="Positive" height={32} />
                    <Typography className="sentimentCount">{document.positiveSentimentCount}</Typography>
                  </Stack>
                </Stack>
              </Box>
            </Stack>
          </Stack>
          {/* Clusters */}
          {document.clusters.map((cluster, index) => (
            <Box key={index} className="clusterContainer">
              {/* <Box display="flex" justifyContent="flex-start" alignItems="center" mb={1}>
                <Typography className="clusterIndex">{`Cluster ${index + 1}`}</Typography>
                <Typography className="clusterComments" sx={{ ml: 2 }}>{`Total Comments Analysed ${cluster.commentCount}`}</Typography>
              </Box>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                <Typography className="clusterTitle">{cluster.clusterName}</Typography>
                <Box display="flex">
                  <Typography className="clusterSentiment" sx={{ color: "#6d6c6c" }}>
                    Overall Sentiment-
                  </Typography>
                  <Typography className="clusterSentiment" sx={{ color: getSentimentColor(cluster.overallSentiment) }}>
                    {cluster.overallSentiment}
                  </Typography>
                </Box>
              </Box> */}

              <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                <Typography className="clusterIndex">
                  {`Cluster ${index + 1}: `}
                  {cluster.clusterName}
                </Typography>
                <Box display="flex">
                  <Typography className="clusterSentiment" sx={{ color: "#6d6c6c" }}>
                    Overall Sentiment-
                  </Typography>
                  <Typography className="clusterSentiment" sx={{ color: getSentimentColor(cluster.overallSentiment) }}>
                    {cluster.overallSentiment}
                  </Typography>
                  <Typography className="clusterComments" sx={{ ml: 1 }}>{`(${cluster.commentCount} comments)`}</Typography>
                </Box>
              </Box>

              <Stack direction={"row"} alignItems={"center"} spacing={1}>
                <Typography className="clusterSubHeaders" sx={{ mb: 0.5 }}>
                  Insights:
                </Typography>
                <Typography variant="body2">{cluster.clusterDescription}</Typography>
              </Stack>
              <Typography className="clusterSubHeaders" sx={{ mt: 2 }}>
                Recommended Actions:
              </Typography>
              <Typography variant="body2" component="ul" sx={{ ml: 1, mt: 2 }}>
                {cluster.recActions.map((action, actionIndex) => (
                  <li style={{ color: "#666666" }} key={actionIndex}>
                    {action}
                  </li>
                ))}
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: "bold", mt: 1 }}>
                Relevant Comments:
              </Typography>
              <Timeline className="commentsTimeline">
                {cluster.relComments.map((comment, commentIndex) => (
                  <TimelineItem key={commentIndex} className="commentsTimeline">
                    <TimelineSeparator>
                      <TimelineDot className="commentsTimeline">
                        <img src={commenticon} alt="Comment Icon" height={32} />
                      </TimelineDot>
                      {commentIndex < cluster.relComments.length - 1 && <TimelineConnector />} {/* Add connector only if it's not the last item */}
                    </TimelineSeparator>
                    <TimelineContent className="commentsTimeline">
                      <Typography className="commentsTimeline" variant="body2" style={{ color: "#666666" }}>
                        {comment}
                      </Typography>
                    </TimelineContent>
                  </TimelineItem>
                ))}
              </Timeline>
              {cluster.linkToComments && (
                <Button variant="text" size="small" sx={{ mt: 1 }} href={cluster.linkToComments} className="viewAllBtn" target="_blank">
                  View All
                </Button>
              )}
            </Box>
          ))}
        </Stack>
      </Stack>
    </Paper>
  );
}

export default SentimentAnalysisPopup;

const sentimentColors = {
  positive: "#46a758",
  negative: "#E5484D",
  neutral: "#FFA01C",
};
/**
 * Get the color associated with the sentiment.
 * @param {string} sentiment - The overall sentiment ("positive", "negative", or "neutral").
 * @returns {string} - The corresponding color code.
 */
const getSentimentColor = (sentiment) => {
  return sentimentColors[sentiment.toLowerCase()] || sentimentColors.neutral; // Default to black if sentiment is invalid
};
