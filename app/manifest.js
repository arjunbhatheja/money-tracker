export default function manifest() {
  return {
    name: 'Money Tracker',
    short_name: 'Money',
    start_url: '/',
    display: 'standalone',
    background_color: '#000000',
    theme_color: '#f2f2f7',
    icons: [{ src: '/icon.png', sizes: '512x512', type: 'image/png' }],
  };
}
