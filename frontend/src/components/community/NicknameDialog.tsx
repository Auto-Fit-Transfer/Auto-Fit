import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { getCommunityErrorMessage, saveCommunityNickname } from '@/src/api/community';
import { AppDialog, AppTextField } from '@/src/components/common';
import { spacing } from '@/src/theme';

const MAX_NICKNAME_LENGTH = 30;

export interface NicknameDialogProps {
  visible: boolean;
  onSaved: () => void;
  onCancel: () => void;
}

// Shown when the server answers COMMUNITY_NICKNAME_REQUIRED: real names are never public.
export function NicknameDialog({ visible, onSaved, onCancel }: NicknameDialogProps) {
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setNickname('');
    setError(undefined);
  };

  const save = async () => {
    const value = nickname.trim();
    if (!value) {
      setError('닉네임을 입력해 주세요.');
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      await saveCommunityNickname(value);
      reset();
      onSaved();
    } catch (saveError) {
      setError(getCommunityErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppDialog
      confirmText={saving ? '저장 중…' : '저장'}
      description="커뮤니티에서는 실명 대신 닉네임만 보여요."
      onCancel={() => {
        reset();
        onCancel();
      }}
      onConfirm={() => void save()}
      title="닉네임을 정해 주세요"
      visible={visible}
    >
      <AppTextField
        autoFocus
        containerStyle={styles.field}
        error={error}
        maxLength={MAX_NICKNAME_LENGTH}
        onChangeText={(value) => {
          setNickname(value);
          setError(undefined);
        }}
        onSubmitEditing={() => void save()}
        placeholder="예: 오늘도운동"
        returnKeyType="done"
        value={nickname}
      />
    </AppDialog>
  );
}

const styles = StyleSheet.create({
  field: { alignSelf: 'stretch', marginTop: spacing.sm },
});
