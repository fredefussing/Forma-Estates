// Declare uppercase image extensions that vite/client doesn't cover by default
declare module '*.JPG' {
  const src: string;
  export default src;
}
declare module '*.JPEG' {
  const src: string;
  export default src;
}
declare module '*.PNG' {
  const src: string;
  export default src;
}
