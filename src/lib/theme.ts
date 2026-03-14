import { createTheme } from "@mui/material/styles";

const base = {
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
  },
  shape: { borderRadius: 12 },
};

export const lightTheme = createTheme({
  ...base,
  palette: {
    mode: "light",
    primary: { main: "#6750A4" },
    secondary: { main: "#625B71" },
    background: { default: "#FFFBFE", paper: "#FFFBFE" },
  },
});

export const darkTheme = createTheme({
  ...base,
  palette: {
    mode: "dark",
    primary: { main: "#D0BCFF" },
    secondary: { main: "#CCC2DC" },
    background: { default: "#1C1B1F", paper: "#2B2930" },
  },
});
