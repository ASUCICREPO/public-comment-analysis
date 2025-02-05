import { useState, useContext } from "react";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import logo from "../assets/logo.svg";
import documentIcon from "../assets/document.svg";
import { InputAdornment } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import AddIcon from "@mui/icons-material/Add";
import InsightsIcon from "@mui/icons-material/Insights";
import { AppContext } from "../AppContext";

function Footer() {
  const { queuedDocIds, addToQueue, clearQueue } = useContext(AppContext);

  return <>{/* <Stack spacing={3}>Footer</Stack> */}</>;
}

export default Footer;
