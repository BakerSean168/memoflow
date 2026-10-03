const params = new URLSearchParams(location.search);
document.documentElement.lang = params.get('locale') === 'zh-CN' ? 'zh-CN' : 'en-US';
document.documentElement.dataset.theme = params.get('theme') === 'dark' ? 'dark' : 'light';
switch (params.get('owner')) {
  case 'goal':
    await import('../goal/reference/main');
    break;
  case 'task':
    await import('../task/visual-grammar/main');
    break;
  case 'schedule':
    await import('../schedule/presentation-authority/main');
    break;
  default:
    await import('./pages');
}
export {};
