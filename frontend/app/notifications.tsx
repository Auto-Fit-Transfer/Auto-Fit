import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from '@/src/components/common';
import { MainHeader, MainScreen, mainStyles } from '@/src/components/main/MainSurface';
export default function Notifications() {
  const router = useRouter();
  return (
    <MainScreen tabs={false}>
      <MainHeader title="알림 설정" height={110} back={() => router.back()} />
      <View style={mainStyles.content}>
        <View style={[mainStyles.card, mainStyles.empty]}>
          <Text style={mainStyles.emptyTitle}>알림 서비스를 준비하고 있어요</Text>
          <Text style={mainStyles.text}>
            식단과 운동 알림은 서비스가 연결되면 설정할 수 있어요.
          </Text>
        </View>
      </View>
    </MainScreen>
  );
}
