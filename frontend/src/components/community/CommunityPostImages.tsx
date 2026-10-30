import { useEffect, useRef, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import CloseIcon from '@/assets/icons/common/X.svg';
import type { CommunityImage } from '@/src/api/community';
import { colors, fontFamilies, radius, spacing } from '@/src/theme';

const GAP = 2;

// X-style grids: 1 | 2 side by side | 1 big + 2 stacked | 2x2 | 2 over 3.
function groupsFor(count: number) {
  if (count === 1) return [[0]];
  if (count === 2) return [[0, 1]];
  if (count === 3) return [[0], [1, 2]];
  if (count === 4)
    return [
      [0, 1],
      [2, 3],
    ];
  return [
    [0, 1],
    [2, 3, 4],
  ];
}

// Width / height of the whole grid. Known before layout, so the feed never jumps.
function gridAspectRatio(images: CommunityImage[]) {
  if (images.length === 1) {
    const [{ width, height }] = images;
    return 1 / Math.min(1.25, Math.max(0.6, height / Math.max(1, width)));
  }
  return 1 / (images.length >= 4 ? 0.75 : 0.6);
}

export function CommunityPostImages({ images, expanded = false }: { images: CommunityImage[]; expanded?: boolean }) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const { width: windowWidth } = useWindowDimensions();
  if (!images.length) return null;

  if (expanded) {
    const imageWidth = Math.max(1, Math.min(windowWidth - spacing.xl * 2, 600));
    return <>
      <View style={[styles.carousel, { width: imageWidth }]}>
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={styles.carouselScroll}
          onMomentumScrollEnd={(event) => setCurrentIndex(Math.max(0, Math.min(images.length - 1, Math.round(event.nativeEvent.contentOffset.x / imageWidth))))}>
          {images.map((image, index) => <Pressable key={index} accessibilityLabel={`사진 ${index + 1}/${images.length} 크게 보기`} accessibilityRole="imagebutton"
            onPress={() => setViewerIndex(index)} style={[styles.carouselImage, { width: imageWidth }]}>
            {image.url ? <Image resizeMode="cover" source={{ uri: image.url }} style={StyleSheet.absoluteFill} /> : null}
          </Pressable>)}
        </ScrollView>
        {images.length > 1 ? <View style={styles.imageCount}><Text style={styles.imageCountText}>{currentIndex + 1}/{images.length}</Text></View> : null}
      </View>
      {images.length > 1 ? <View style={styles.dots}>{images.map((_, index) => <View key={index} style={[styles.dot, index === currentIndex && styles.activeDot]} />)}</View> : null}
      {viewerIndex !== null ? <PhotoViewer images={images} initialIndex={viewerIndex} onClose={() => setViewerIndex(null)} /> : null}
    </>;
  }

  const groups = groupsFor(images.length);
  const columns = images.length === 3;

  return (
    <>
      <View
        style={[
          styles.grid,
          { aspectRatio: gridAspectRatio(images), flexDirection: columns ? 'row' : 'column' },
        ]}
      >
        {groups.map((group) => (
          <View
            key={group.join('-')}
            style={[styles.group, { flexDirection: columns ? 'column' : 'row' }]}
          >
            {group.map((index) => (
              <Pressable
                key={index}
                accessibilityLabel={`사진 ${index + 1}/${images.length} 크게 보기`}
                accessibilityRole="imagebutton"
                onPress={() => setViewerIndex(index)}
                style={styles.cell}
              >
                {images[index].url ? (
                  <Image
                    resizeMode="cover"
                    source={{ uri: images[index].url }}
                    style={StyleSheet.absoluteFill}
                  />
                ) : null}
              </Pressable>
            ))}
          </View>
        ))}
      </View>
      {viewerIndex !== null ? (
        <PhotoViewer
          images={images}
          initialIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      ) : null}
    </>
  );
}

function PhotoViewer({
  images,
  initialIndex,
  onClose,
}: {
  images: CommunityImage[];
  initialIndex: number;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(initialIndex);

  // Mounted only while open, so the index starts fresh each time.
  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      scrollRef.current?.scrollTo({ animated: false, x: initialIndex * width }),
    );
    return () => cancelAnimationFrame(frame);
  }, [initialIndex, width]);

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <View style={styles.viewer}>
        <ScrollView
          ref={scrollRef}
          horizontal
          onMomentumScrollEnd={(event) =>
            setIndex(Math.round(event.nativeEvent.contentOffset.x / Math.max(1, width)))
          }
          pagingEnabled
          showsHorizontalScrollIndicator={false}
        >
          {images.map((image, imageIndex) => (
            <View key={imageIndex} style={{ height, width }}>
              {image.url ? (
                <Image resizeMode="contain" source={{ uri: image.url }} style={styles.fullImage} />
              ) : null}
            </View>
          ))}
        </ScrollView>
        <View style={[styles.viewerBar, { top: insets.top + 8 }]}>
          <Text style={styles.counter}>
            {Math.min(index + 1, images.length)} / {images.length}
          </Text>
          <Pressable
            accessibilityLabel="사진 닫기"
            accessibilityRole="button"
            hitSlop={8}
            onPress={onClose}
            style={styles.close}
          >
            <CloseIcon color={colors.surface} height={24} width={24} />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  carousel: { aspectRatio: 1.45, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.background },
  carouselScroll: { flex: 1 },
  carouselImage: { height: '100%', backgroundColor: colors.background },
  imageCount: { position: 'absolute', right: 10, top: 10, borderRadius: radius.round, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 8, paddingVertical: 4 },
  imageCountText: { color: colors.surface, fontSize: 11 },
  dots: { flexDirection: 'row', alignSelf: 'center', gap: 5 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.border },
  activeDot: { backgroundColor: colors.textPrimary },
  grid: { borderRadius: radius.lg, gap: GAP, marginTop: 10, overflow: 'hidden', width: '100%' },
  group: { flex: 1, gap: GAP },
  cell: { backgroundColor: colors.border, flex: 1, overflow: 'hidden' },
  viewer: { backgroundColor: '#000000', flex: 1 },
  fullImage: { flex: 1 },
  viewerBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: 16,
    position: 'absolute',
    right: 16,
  },
  counter: { color: colors.surface, fontFamily: fontFamilies.pretendardMedium, fontSize: 15 },
  close: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderRadius: radius.round,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
});
