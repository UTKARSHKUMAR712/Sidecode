fetch('https://godbolt.org/api/compiler/tsc_0_0_35_gc/compile', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  },
  body: JSON.stringify({
    source: 'const a: string = "Hello TS"; console.log(a);',
    options: {
      compilerOptions: { executorRequest: true },
      executeParameters: { stdin: '' }
    }
  })
}).then(r=>r.json()).then(data => console.log(JSON.stringify(data, null, 2)))
