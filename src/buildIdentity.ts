declare const __AHD_BUILD_LABEL__: string;

export const BUILD_LABEL = typeof __AHD_BUILD_LABEL__ === 'string'
  ? __AHD_BUILD_LABEL__
  : 'Development build';
