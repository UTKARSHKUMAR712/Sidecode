fetch('https://godbolt.org/api/compiler/v8113/compile', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  },
  body: JSON.stringify({
    source: 'console.log("Hello V8");',
    options: {
      compilerOptions: { executorRequest: true },
      executeParameters: { stdin: '' }
    }
  })
}).then(r=>r.json()).then(data => console.log(JSON.stringify(data, null, 2)))
