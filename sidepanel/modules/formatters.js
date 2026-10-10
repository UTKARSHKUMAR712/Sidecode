export function registerCloudFormatters(monaco) {
  const godboltLanguages = ['c', 'cpp', 'java', 'rust', 'go'];

  godboltLanguages.forEach((lang) => {
    monaco.languages.registerDocumentFormattingEditProvider(lang, {
      async provideDocumentFormattingEdits(model) {
        let formatter = null;
        if (['c', 'cpp', 'java'].includes(lang)) formatter = 'clangformat';
        else if (lang === 'rust') formatter = 'rustfmt';
        else if (lang === 'go') formatter = 'gofmt';

        if (!formatter) return [];

        try {
          // Tell the console we are formatting via cloud
          import('./console.js').then(({ openConsole, appendLine }) => {
            openConsole();
            appendLine('system', `Formatting with ${formatter}...`);
          });

          const res = await fetch(`https://godbolt.org/api/format/${formatter}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify({ source: model.getValue(), base: 'Google' })
          });

          if (res.ok) {
            const data = await res.json();
            if (data.answer) {
              return [{
                range: model.getFullModelRange(),
                text: data.answer
              }];
            }
          }
        } catch (err) {
          console.warn('Godbolt format failed:', err);
        }
        return [];
      }
    });
  });
}
