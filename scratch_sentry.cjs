const fs = require('fs');

const files = [
  'src/pages/mobile/Today.tsx',
  'src/pages/mobile/Sites.tsx',
  'src/pages/mobile/SiteDetail.tsx',
  'src/pages/mobile/Profile.tsx',
  'src/pages/admin/Checklists.tsx',
  'src/pages/admin/Sites.tsx',
  'src/pages/admin/Dashboard.tsx',
  'src/lib/supabase.ts',
  'src/hooks/useAuth.ts',
  'src/components/admin/CreateSiteModal.tsx',
  'src/components/admin/AdminLayout.tsx'
];

files.forEach(file => {
  if (!fs.existsSync(file)) return;
  let content = fs.readFileSync(file, 'utf8');
  
  if (content.includes('console.error')) {
    if (!content.includes('import * as Sentry from')) {
      const lines = content.split('\n');
      let lastImportIndex = 0;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('import ')) lastImportIndex = i;
      }
      lines.splice(lastImportIndex + 1, 0, 'import * as Sentry from "@sentry/react";');
      content = lines.join('\n');
    }

    content = content.replace(/console\.error\((.*?)\);?/g, (match, args) => {
      // If it's already Sentry wrapped (from previous failed run), return
      if (content.includes('Sentry.captureException')) {
        // Just return match for now, but wait, the outer replace handles it
      }
      
      const splitArgs = args.split(',').map(s => s.trim());
      if (splitArgs.length >= 2) {
        const msg = splitArgs[0];
        const err = splitArgs.slice(1).join(', ');
        return 'console.error(' + args + '); Sentry.captureException(' + err + ', { extra: { context: ' + msg + ' } });';
      } else {
        const err = splitArgs[0];
        return 'console.error(' + args + '); Sentry.captureException(' + err + ');';
      }
    });

    // Remove duplicates if the script ran multiple times accidentally
    content = content.replace(/(Sentry\.captureException\(.*?\);)\s*\1/g, '$1');

    fs.writeFileSync(file, content);
    console.log('Updated', file);
  }
});
