export default function manifest() {
  return {
    name: 'Money Tracker',
    short_name: 'Money',
    start_url: '/',
    display: 'standalone',
    background_color: '#121311',
    theme_color: '#1f6f5c',
    icons: [{ src: '/icon.png', sizes: '512x512', type: 'image/png' }],
  };
}
