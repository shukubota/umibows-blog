// wrangler.jsonc の rules（Text）で .html を文字列として import する
declare module "*.html" {
  const content: string;
  export default content;
}
