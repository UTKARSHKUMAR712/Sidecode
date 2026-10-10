/**
 * piston.js — Re-exports cloudRunner for backwards compatibility
 */
export { isCloudSupported as isPistonSupported, executeViaCloud as executeViaPiston } from './cloudRunner.js';
