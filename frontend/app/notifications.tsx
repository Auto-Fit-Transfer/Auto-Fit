import { useRouter } from 'expo-router';

import { Notice } from '@/src/components/common';
import { SubScreen } from '@/src/components/navigation';

// Figma G4 has a switch per kind of notice; they come once the notification service is ready.
export default function Notifications() {
  const router = useRouter();
  return (
    <SubScreen onBack={() => router.back()} title="알림 설정">
      <Notice
        body="식단 · 운동 · 건강 데이터 · 커뮤니티 알림은 알림 서비스가 연결되면 여기서 켜고 끌 수 있어요."
        title="알림 서비스를 준비하고 있어요"
      />
    </SubScreen>
  );
}
