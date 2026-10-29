import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';

import { getApiErrorMessage } from '@/src/api/client';
import { getCommunityMileage, getCommunityProfile } from '@/src/api/community';
import { getProfile, getProfileName } from '@/src/api/home';
import { AppDialog } from '@/src/components/common';
import { MyView, type MyViewProps } from '@/src/components/my/MyView';
import { getSupabaseClient } from '@/src/lib/supabase';

function daysSince(iso: string | undefined) {
  if (!iso) return null;
  const start = new Date(iso);
  if (Number.isNaN(start.getTime())) return null;
  return Math.max(1, Math.floor((Date.now() - start.getTime()) / 86400000) + 1);
}

export default function MyScreen() {
  const router = useRouter();
  const [name, setName] = useState('회원');
  const [userId, setUserId] = useState<string | null>(null);
  const [joinedDays, setJoinedDays] = useState<number | null>(null);
  const [stats, setStats] = useState<MyViewProps['stats']>(null);
  const [mileage, setMileage] = useState<number | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [logoutError, setLogoutError] = useState('');

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void (async () => {
        const { data } = await getSupabaseClient().auth.getUser();
        const user = data.user;
        if (!live) return;
        setUserId(user?.id ?? null);
        setJoinedDays(daysSince(user?.created_at));
        const [profile, community, points] = await Promise.allSettled([
          getProfile(),
          getCommunityProfile('me'),
          getCommunityMileage(),
        ]);
        if (!live) return;
        if (profile.status === 'fulfilled') setName(getProfileName(profile.value) ?? '회원');
        if (community.status === 'fulfilled') {
          const p = community.value;
          setStats({
            posts: p.post_count,
            followers: p.follower_count,
            following: p.following_count,
          });
        }
        if (points.status === 'fulfilled') setMileage(points.value.balance);
      })().catch(() => undefined);
      return () => {
        live = false;
      };
    }, []),
  );

  const openFollows = (kind: 'followers' | 'following') => {
    if (userId) router.push({ pathname: '/community/follows', params: { userId, kind } });
  };

  const logout = async () => {
    setLogoutError('');
    try {
      const { error } = await getSupabaseClient().auth.signOut();
      if (error) throw error;
      setConfirmLogout(false);
      router.replace('/login');
    } catch (error) {
      setLogoutError(getApiErrorMessage(error));
    }
  };

  return (
    <>
      <MyView
        joinedDays={joinedDays}
        mileage={mileage}
        name={name}
        onEditProfile={() => router.push('/profile')}
        onLogout={() => setConfirmLogout(true)}
        onOpenAccount={() => router.push('/account')}
        onOpenExerciseSettings={() => router.push('/exercise/condition')}
        onOpenFollowers={() => openFollows('followers')}
        onOpenFollowing={() => openFollows('following')}
        onOpenGoal={() => router.push('/exercise/goal')}
        onOpenMileage={() => router.push('/community/mileage')}
        onOpenNotifications={() => router.push('/notifications')}
        onOpenPosts={() => userId && router.push(`/community/user/${userId}`)}
        onOpenReport={() => router.push('/total-analysis')}
        onUploadData={() => router.push('/upload')}
        stats={stats}
      />
      <AppDialog
        confirmText="로그아웃"
        description={logoutError || '다시 로그인하면 기록은 그대로예요.'}
        onCancel={() => setConfirmLogout(false)}
        onConfirm={() => void logout()}
        title="로그아웃할까요?"
        visible={confirmLogout}
      />
    </>
  );
}
