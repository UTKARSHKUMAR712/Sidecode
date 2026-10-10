const start = performance.now();
fetch('https://godbolt.org/api/compiler/v8trunk/compile', {
  method: 'POST',
  headers: {'Content-Type': 'application/json', 'Accept': 'application/json'},
  body: JSON.stringify({
    source: 'console.log("Hello V8 trunk");',
    options: { compilerOptions: { executorRequest: true }, executeParameters: { stdin: '' } }
  })
}).then(r=>r.json()).then(data => {
  console.log(data.stdout);
  console.log('v8trunk Took ' + (performance.now() - start) + 'ms');
});

const start2 = performance.now();
fetch('https://godbolt.org/api/compiler/v8113/compile', {
  method: 'POST',
  headers: {'Content-Type': 'application/json', 'Accept': 'application/json'},
  body: JSON.stringify({
    source: 'console.log("Hello V8 11.3");',
    options: { compilerOptions: { executorRequest: true }, executeParameters: { stdin: '' } }
  })
}).then(r=>r.json()).then(data => {
  console.log(data.stdout);
  console.log('v8113 Took ' + (performance.now() - start2) + 'ms');
});
