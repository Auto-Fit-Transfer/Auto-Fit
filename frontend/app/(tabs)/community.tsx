import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import SearchIcon from '@/assets/figma/main/72831.svg';
import SortIcon from '@/assets/figma/main/aca0c.svg';
import WriteIcon from '@/assets/figma/main/6899f.svg';
import { MainHeader, MainScreen, mainStyles } from '@/src/components/main/MainSurface';
import { colors, fontFamilies } from '@/src/theme';

export default function CommunityScreen() {
  const [category, setCategory] = useState('전체');
  const [query, setQuery] = useState('');
  const [order, setOrder] = useState('최신순');
  const [orderOpen, setOrderOpen] = useState(false);
  return (
    <MainScreen>
      <MainHeader title="커뮤니티" height={130}>
        <View style={styles.search}>
          <TextInput
            accessibilityLabel="커뮤니티 검색"
            value={query}
            onChangeText={setQuery}
            placeholder="함께 기록하고, 서로의 루틴을 나눠보세요."
            placeholderTextColor={colors.textWhiteSecondary}
            style={styles.input}
          />
          <SearchIcon />
        </View>
      </MainHeader>
      <View style={styles.filters}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: orderOpen }}
          onPress={() => setOrderOpen(!orderOpen)}
          style={[styles.chip, styles.selected]}
        >
          <Text style={styles.selectedText}>{order}</Text>
          <SortIcon />
        </Pressable>
        {['운동', '일상'].map((item) => (
          <Pressable
            key={item}
            accessibilityRole="button"
            accessibilityState={{ selected: category === item }}
            onPress={() => setCategory(category === item ? '전체' : item)}
            style={[styles.chip, category === item && styles.selected]}
          >
            <Text style={category === item ? styles.selectedText : styles.text}>{item}</Text>
          </Pressable>
        ))}
        <View style={{ flex: 1 }} />
        <View
          accessibilityLabel="글쓰기 준비 중"
          style={[styles.chip, styles.write, { opacity: 0.45 }]}
        >
          <WriteIcon />
          <Text style={styles.selectedText}>글쓰기</Text>
        </View>
      </View>
      {orderOpen ? (
        <View style={styles.orders}>
          {['최신순', '인기순'].map((item) => (
            <Pressable
              key={item}
              onPress={() => {
                setOrder(item);
                setOrderOpen(false);
              }}
              style={styles.order}
            >
              <Text style={styles.selectedText}>{item}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <View style={[mainStyles.card, mainStyles.empty, { margin: 16 }]}>
        <Text style={mainStyles.emptyTitle}>함께 나눌 이야기를 준비하고 있어요</Text>
        <Text style={[mainStyles.text, { textAlign: 'center' }]}>
          {query
            ? `“${query}” 검색은 커뮤니티가 열리면 이용할 수 있어요.`
            : '커뮤니티 서비스 준비 중입니다.\n게시글을 확인하고 루틴을 공유할 수 있게 될 예정이에요.'}
        </Text>
      </View>
    </MainScreen>
  );
}

const styles = StyleSheet.create({
  search: {
    height: 37,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#9996AB',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    marginTop: -10,
    gap: 8,
    backgroundColor: '#302D39',
  },
  input: {
    flex: 1,
    color: colors.textWhite,
    fontSize: 13,
    fontFamily: fontFamilies.pretendardRegular,
    minWidth: 0,
  },
  filters: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 15,
    marginTop: 15,
    gap: 5,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 11,
    minHeight: 32,
    borderRadius: 20,
    borderColor: colors.border,
    borderWidth: 1,
  },
  selected: { backgroundColor: colors.primaryLight, borderColor: colors.primaryLight },
  selectedText: { color: colors.primary, fontFamily: fontFamilies.pretendardMedium, fontSize: 14 },
  text: { color: colors.textSecondary, fontSize: 14 },
  write: { borderColor: colors.primary },
  orders: {
    marginLeft: 15,
    marginTop: 8,
    padding: 8,
    width: 100,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
  },
  order: { padding: 10 },
});
