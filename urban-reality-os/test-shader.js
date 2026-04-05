const shader = `
attribute vec3 aPosition;
void main() {
  gl_Position = vec4(aPosition, 1.0);
}
`;
console.log('Shader syntax OK');