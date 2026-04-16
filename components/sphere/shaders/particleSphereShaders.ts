export const particleVertexShader = `
  precision highp float;

  attribute float aSeed;
  attribute float aSize;

  uniform float uTime;
  uniform float uAmplitude;
  uniform float uActive;
  uniform vec4 uState;

  varying float vColorMix;
  varying float vGlow;
  varying float vAlphaPulse;

  float softNoise(vec3 p) {
    return sin(p.x * 3.1 + uTime * 0.52) *
      cos(p.y * 4.7 - uTime * 0.38) *
      sin(p.z * 5.3 + aSeed * 6.28318);
  }

  void main() {
    vec3 normal = normalize(position);
    float idle = sin(uTime * 1.12 + aSeed * 6.28318) * 0.032;
    float breath = sin(uTime * 0.72) * 0.036;
    float listen = uState.y * (0.12 + uAmplitude * 0.34);
    float think = uState.z * softNoise(normal * 1.7) * 0.085;
    float wave = sin((normal.y + 1.0) * 10.0 - uTime * 4.9 + aSeed * 2.1);
    float speaking = uState.w * (-0.055 + wave * 0.105 + uAmplitude * 0.25);
    float centerFocus = uActive * -0.045;
    float displacement = idle + breath + listen + think + speaking + centerFocus;

    vec3 transformed = normal * (1.42 + displacement);
    vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);

    vColorMix = clamp(0.38 + normal.y * 0.24 + uAmplitude * 0.42 + uState.w * 0.18, 0.0, 1.0);
    vGlow = clamp(0.42 + abs(wave) * uState.w + uState.y * 0.35 + uState.z * 0.2, 0.0, 1.0);
    vAlphaPulse = clamp(0.72 + sin(uTime * 1.8 + aSeed * 9.0) * 0.16 + uState.w * abs(wave) * 0.2, 0.0, 1.0);

    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = aSize * (70.0 / -mvPosition.z) * (1.0 + uAmplitude * 0.55 + uState.y * 0.12);
  }
`;

export const particleFragmentShader = `
  precision highp float;

  uniform vec4 uState;

  varying float vColorMix;
  varying float vGlow;
  varying float vAlphaPulse;

  void main() {
    vec2 uv = gl_PointCoord - vec2(0.5);
    float radius = length(uv);
    float alpha = smoothstep(0.5, 0.02, radius);
    float core = smoothstep(0.18, 0.0, radius);

    vec3 deepBlue = vec3(0.102, 0.102, 0.306);
    vec3 violet = vec3(0.420, 0.129, 0.659);
    vec3 cyan = vec3(0.024, 0.714, 0.831);

    vec3 color = mix(deepBlue, violet, vColorMix);
    float cyanInfluence = clamp(uState.y * 0.55 + uState.w * 0.42 + vGlow * 0.16, 0.0, 0.82);
    color = mix(color, cyan, cyanInfluence);
    color += core * vec3(0.24, 0.2, 0.36);

    gl_FragColor = vec4(color, alpha * (0.42 + vGlow * 0.35) * vAlphaPulse);
  }
`;

export const linkVertexShader = `
  precision highp float;

  attribute float aSeed;

  uniform float uTime;
  uniform float uAmplitude;
  uniform float uActive;
  uniform vec4 uState;

  varying float vLinkGlow;

  float softNoise(vec3 p) {
    return sin(p.x * 3.1 + uTime * 0.52) *
      cos(p.y * 4.7 - uTime * 0.38) *
      sin(p.z * 5.3 + aSeed * 6.28318);
  }

  void main() {
    vec3 normal = normalize(position);
    float idle = sin(uTime * 1.12 + aSeed * 6.28318) * 0.032;
    float breath = sin(uTime * 0.72) * 0.036;
    float listen = uState.y * (0.12 + uAmplitude * 0.34);
    float think = uState.z * softNoise(normal * 1.7) * 0.085;
    float wave = sin((normal.y + 1.0) * 10.0 - uTime * 4.9 + aSeed * 2.1);
    float speaking = uState.w * (-0.055 + wave * 0.105 + uAmplitude * 0.25);
    float centerFocus = uActive * -0.045;
    float displacement = idle + breath + listen + think + speaking + centerFocus;
    vec3 transformed = normal * (1.42 + displacement);

    vLinkGlow = clamp(0.28 + uState.y * 0.4 + uState.z * 0.28 + uState.w * abs(wave) * 0.34, 0.0, 1.0);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  }
`;

export const linkFragmentShader = `
  precision highp float;

  uniform float uLineOpacity;
  uniform vec4 uState;

  varying float vLinkGlow;

  void main() {
    vec3 deepBlue = vec3(0.102, 0.102, 0.306);
    vec3 violet = vec3(0.420, 0.129, 0.659);
    vec3 cyan = vec3(0.024, 0.714, 0.831);
    vec3 color = mix(deepBlue, violet, 0.42 + uState.z * 0.18);
    color = mix(color, cyan, clamp(uState.y * 0.48 + uState.w * 0.34, 0.0, 0.72));

    gl_FragColor = vec4(color, uLineOpacity * vLinkGlow);
  }
`;
