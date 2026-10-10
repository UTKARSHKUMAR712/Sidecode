fetch('https://godbolt.org/api/compiler/v8113/compile', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  },
  body: JSON.stringify({
    source: 'const input = readline(); console.log("You typed: " + input);',
    options: {
      compilerOptions: { executorRequest: true },
      executeParameters: { stdin: 'Hello World\n' }
    }
  })
}).then(r=>r.json()).then(data => console.log(JSON.stringify(data, null, 2)))
