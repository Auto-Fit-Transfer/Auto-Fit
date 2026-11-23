import { useEffect, useRef, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import CloseIcon from '@/assets/icons/common/X.svg';
import type { CommunityImage } from '@/src/api/community';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';
import { Text } from '@/src/components/common';

const GAP = 4;

// Grids: 1 | 2 side by side | 1 big + 2 stacked, with the rest behind a +N on the last photo.
function groupsFor(count: number) {
  if (count === 1) return [[0]];
  if (count === 2) return [[0, 1]];
  return [[0], [1, 2]];
}

// Width / height of the whole grid. Known before layout, so the feed never jumps.
function gridAspectRatio(images: CommunityImage[]) {
  if (images.length === 1) {
    const [{ width, height }] = images;
    return 1 / Math.min(1.25, Math.max(0.6, height / Math.max(1, width)));
  }
  return images.length >= 3 ? 372 / 184 : 1 / 0.6;
}

export function CommunityPostImages({ images, expanded = false }: { images: CommunityImage[]; expanded?: boolean }) {
  const styles = useThemedStyles(createStyles);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const { width: windowWidth } = useWindowDimensions();
  if (!images.length) return null;

  if (expanded) {
    // As wide as the inside of the post's card: 16 margin + 2 outline + 14 padding on each side.
    const imageWidth = Math.max(1, Math.min(windowWidth, 480) - 64);
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
  const columns = images.length >= 3;

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
                {index === 2 && images.length > 3 ? (
                  <View style={styles.moreOverlay}><Text style={styles.moreText}>+{images.length - 3}</Text></View>
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
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
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

function createStyles({ colors }: AppTheme) {
  // Renewal A: square dots, pixel letters. On the dark viewer the letters stay white (the theme's
  // colour for letters on violet is dark).
  return {
    carousel: { aspectRatio: 1.45, backgroundColor: colors.surfaceMuted, borderRadius: 16, overflow: 'hidden' },
    carouselScroll: { flex: 1 },
    carouselImage: { backgroundColor: colors.track, height: '100%' },
    imageCount: { backgroundColor: colors.ink, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, position: 'absolute', right: 10, top: 10 },
    imageCountText: { color: '#FFFFFF', fontFamily: fontFamilies.galmuri11, fontSize: 12, lineHeight: 17 },
    dots: { alignSelf: 'center', flexDirection: 'row', gap: 5 },
    dot: { backgroundColor: colors.surfaceMuted, borderRadius: 3, height: 6, width: 6 },
    activeDot: { backgroundColor: colors.ink },
    grid: { borderRadius: 16, gap: GAP, overflow: 'hidden', width: '100%' },
    moreOverlay: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)', bottom: 0, justifyContent: 'center', left: 0, position: 'absolute', right: 0, top: 0 },
    moreText: { color: '#FFFFFF', fontFamily: fontFamilies.galmuri11Bold, fontSize: 22, lineHeight: 26 },
    group: { flex: 1, gap: GAP },
    cell: { backgroundColor: colors.track, flex: 1, overflow: 'hidden' },
    viewer: { backgroundColor: '#000000', flex: 1 },
    fullImage: { flex: 1 },
    viewerBar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', left: 16, position: 'absolute', right: 16 },
    counter: { color: '#FFFFFF', fontFamily: fontFamilies.galmuri14, fontSize: 15, lineHeight: 21 },
    close: { alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.45)', borderColor: '#FFFFFF', borderRadius: 12, borderWidth: 2, height: 40, justifyContent: 'center', width: 40 },
  } as const;
}
