// Preset perangkat untuk tool Frame (spec-viewer-device-presets, desain Figma frame presets): ukuran dalam poin,
// `screen` mengikuti enum skema ('mobile' untuk ponsel, 'app' untuk tablet/desktop). Murni data — sisip tetap
// memakai op `add` board biasa lewat codegen.insertBoardPlaced/insertBoardAt.

export type DevicePreset = { name: string; width: number; height: number; screen: 'landing' | 'app' | 'mobile' };

export type DevicePresetGroup = { group: string; presets: readonly DevicePreset[] };

export const DEVICE_PRESETS: readonly DevicePresetGroup[] = [
  {
    group: 'phone',
    presets: [
      { name: 'iPhone 18', width: 393, height: 852, screen: 'mobile' },
      { name: 'iPhone 18 Pro', width: 402, height: 874, screen: 'mobile' },
      { name: 'iPhone 18 Pro Max', width: 440, height: 956, screen: 'mobile' },
      { name: 'iPhone SE', width: 375, height: 667, screen: 'mobile' },
      { name: 'Android Small', width: 360, height: 640, screen: 'mobile' },
      { name: 'Android Medium', width: 360, height: 800, screen: 'mobile' },
      { name: 'Android Large', width: 412, height: 915, screen: 'mobile' },
    ],
  },
  {
    group: 'tablet',
    presets: [
      { name: 'iPad Mini', width: 744, height: 1133, screen: 'app' },
      { name: 'iPad Air', width: 820, height: 1180, screen: 'app' },
      { name: 'iPad Pro 11', width: 834, height: 1194, screen: 'app' },
      { name: 'iPad Pro 13', width: 1024, height: 1366, screen: 'app' },
      { name: 'Android Tablet', width: 800, height: 1280, screen: 'app' },
    ],
  },
  {
    group: 'desktop',
    presets: [
      { name: 'MacBook Air', width: 1280, height: 832, screen: 'app' },
      { name: 'MacBook Pro 14', width: 1512, height: 982, screen: 'app' },
      { name: 'Desktop', width: 1440, height: 1024, screen: 'app' },
      { name: 'Presentation', width: 1280, height: 720, screen: 'app' },
    ],
  },
];
