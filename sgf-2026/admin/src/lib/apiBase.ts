// O admin é servido sob /admin (proxy da Vercel). As funções serverless ficam
// sob o mesmo prefixo: /admin/api/*. BASE_URL é injetado pelo Vite ('/admin/').
export function apiUrl(path: string): string {
  return `${import.meta.env.BASE_URL}api/${path.replace(/^\/?(api\/)?/, '')}`;
}
