import { Image, Platform, View, type ImageStyle } from 'react-native';

// Renewal A's pixel pictures (assets/a). One picture pixel is two screen points; the files are stored
// four times as large with hard edges, so a phone only ever shrinks them and the pixels stay sharp.
export type Who = 'worker-f' | 'worker-m' | 'student-f' | 'student-m';
export const WHO_KEY = 'auto-fit.a.who.v1';
export const whoList: Who[] = ['worker-f', 'worker-m', 'student-f', 'student-m'];

// One strip per character: five tiers across (w = one tier's width in picture pixels), two walk frames down.
const strips = {
  'worker-f': { source: require('@/assets/a/worker-f.png'), w: 90 },
  'worker-m': { source: require('@/assets/a/worker-m.png'), w: 86 },
  'student-f': { source: require('@/assets/a/student-f.png'), w: 88 },
  'student-m': { source: require('@/assets/a/student-m.png'), w: 88 },
} as const;
// The proud pose (hands on hips), drawn the same way: five tiers across, two frames down.
const prouds = {
  'worker-f': { source: require('@/assets/a/worker-f-win.png'), w: 70 },
  'worker-m': { source: require('@/assets/a/worker-m-win.png'), w: 68 },
  'student-f': { source: require('@/assets/a/student-f-win.png'), w: 96 },
  'student-m': { source: require('@/assets/a/student-m-win.png'), w: 84 },
} as const;
const CELL = 136; // a cell's height: the feet stand on its bottom line
const icons = require('@/assets/a/icons.png');
export const street = require('@/assets/a/street.png');
export const STREET = { width: 1012, height: 760 }; // as drawn on screen

// The web would smooth the picture when it resizes it; phones are handled by the enlarged files.
export const pixelated = (Platform.OS === 'web' ? { imageRendering: 'pixelated' } : null) as ImageStyle | null;

export const heroWidth = (who: Who, zoom = 2) => strips[who].w * zoom;
export const HERO_HEIGHT = CELL * 2;

// The character at a tier (0 CORE … 4 PEAK); frame 0 or 1 are the two steps of the walk.
// `proud` draws it standing with its hands on its hips instead (the one that answers in 물어보기).
export function Hero({
  who,
  tier,
  frame = 0,
  zoom = 2,
  proud = false,
}: {
  who: Who;
  tier: number;
  frame?: 0 | 1;
  zoom?: number;
  proud?: boolean;
}) {
  const { source, w } = (proud ? prouds : strips)[who];
  return (
    <View accessible={false} style={{ height: CELL * zoom, overflow: 'hidden', width: w * zoom }}>
      <Image
        resizeMode="stretch"
        source={source}
        style={[
          { height: CELL * 2 * zoom, left: -tier * w * zoom, position: 'absolute', top: -frame * CELL * zoom, width: w * 5 * zoom },
          pixelated,
        ]}
      />
    </View>
  );
}

// Just the head, for the name card and the marker on the road.
export function HeroHead({ who, tier }: { who: Who; tier: number }) {
  const { source, w } = strips[who];
  return (
    <View accessible={false} style={{ height: 24, overflow: 'hidden', width: 26 }}>
      <Image
        resizeMode="stretch"
        source={source}
        style={[
          { height: CELL, left: -((tier * w) / 2 + w / 4 - 13), position: 'absolute', top: -8, width: w * 2.5 },
          pixelated,
        ]}
      />
    </View>
  );
}

// icons.png holds eight icons in a row: 0 식단 1 운동 2 커뮤니티 3 리포트 4 걸음 5 물 6 스트레칭 7 산책
export function PixelIcon({ index, size = 32 }: { index: number; size?: number }) {
  return (
    <View accessible={false} style={{ height: size, overflow: 'hidden', width: size }}>
      <Image
        resizeMode="stretch"
        source={icons}
        style={[{ height: size, left: -index * size, position: 'absolute', top: 0, width: size * 8 }, pixelated]}
      />
    </View>
  );
}
