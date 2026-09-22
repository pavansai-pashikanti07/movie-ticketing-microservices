const fs = require('fs');
const path = require('path');

const frontendDir = path.resolve(__dirname, '..', 'services', 'frontend');
const outputFile = path.resolve(__dirname, '..', 'k8s', 'manifests', '07-frontend-configmap.yaml');

const indexHtml = fs.readFileSync(path.join(frontendDir, 'index.html'), 'utf8');
const styleCss = fs.readFileSync(path.join(frontendDir, 'style.css'), 'utf8');
const appJs = fs.readFileSync(path.join(frontendDir, 'app.js'), 'utf8');

function indent(text, spaces) {
  const pad = ' '.repeat(spaces);
  return text.split('\n').map(line => pad + line).join('\n');
}

const yamlContent = `apiVersion: v1
kind: ConfigMap
metadata:
  name: cinepass-frontend-assets
  namespace: cinepass-dev
  labels:
    app.kubernetes.io/part-of: cinepass
data:
  index.html: |
${indent(indexHtml, 4)}
  style.css: |
${indent(styleCss, 4)}
  app.js: |
${indent(appJs, 4)}
`;

fs.writeFileSync(outputFile, yamlContent, 'utf8');
console.log('Successfully generated clean UTF-8 k8s/manifests/07-frontend-configmap.yaml');
