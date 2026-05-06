/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export default function App() {
  const screens = [
    { name: 'Mobile - Šiandien', url: '/mobile-today.html' },
    { name: 'Mobile - Site Detail', url: '/mobile-site-detail.html' },
    { name: 'Mobile - Checklist', url: '/mobile-checklist.html' },
    { name: 'Mobile - Photos', url: '/mobile-photos.html' },
    { name: 'Mobile - Mano laikas', url: '/mobile-time.html' },
    { name: 'Admin - Dashboard', url: '/admin-dashboard.html' },
    { name: 'Admin - Sites List', url: '/admin-sites-list.html' },
    { name: 'Admin - Site Detail', url: '/admin-site-detail.html' },
    { name: 'Admin - Checklists', url: '/admin-checklists.html' },
    { name: 'Admin - Bonuses', url: '/admin-bonuses.html' },
  ];

  return (
    <div className="p-8 font-sans max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 text-[#1d033a]">InstallerApp Mockups</h1>
      <ul className="space-y-3">
        {screens.map(screen => (
          <li key={screen.url}>
            <a 
              href={screen.url} 
              className="block p-4 bg-white border border-[#cdc3d4] rounded-lg shadow-sm hover:shadow-md hover:border-[#490891] transition-all text-[#490891] font-semibold"
            >
              {screen.name}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
