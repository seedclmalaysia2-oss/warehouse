// Colour theme: "light", "dark", or unset = follow the device.
// globals.css already styles :root[data-theme="light" | "dark"]; the choice is
// kept in localStorage and put on <html> before first paint by the inline
// script below, so a saved choice never flashes the other theme.
export const THEME_KEY = "warehouse-theme";

export const themeInitScript = `try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
