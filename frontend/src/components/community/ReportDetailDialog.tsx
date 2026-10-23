import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { AppDialog, AppTextField } from '@/src/components/common';
import { spacing } from '@/src/theme';

const MAX_DETAIL_LENGTH = 300;

export interface ReportDetailDialogProps {
  visible: boolean;
  reasonLabel: string;
  onSubmit: (detail: string | null) => void;
  onCancel: () => void;
}

// Optional free text after picking a reason; moderators see it (never who sent it).
export function ReportDetailDialog({
  visible,
  reasonLabel,
  onSubmit,
  onCancel,
}: ReportDetailDialogProps) {
  const [detail, setDetail] = useState('');

  const close = (submit: boolean) => {
    const value = detail.trim();
    setDetail('');
    if (submit) onSubmit(value || null);
    else onCancel();
  };

  return (
    <AppDialog
      cancelText="취소"
      confirmText="신고하기"
      description={`사유: ${reasonLabel}\n자세한 내용은 적지 않아도 돼요. 신고한 사람은 상대에게 알려지지 않아요.`}
      onCancel={() => close(false)}
      onConfirm={() => close(true)}
      title="신고할까요?"
      visible={visible}
    >
      <AppTextField
        containerStyle={styles.field}
        maxLength={MAX_DETAIL_LENGTH}
        multiline
        onChangeText={setDetail}
        placeholder="예: 같은 광고 글을 여러 번 올려요 (선택)"
        value={detail}
      />
    </AppDialog>
  );
}

const styles = StyleSheet.create({
  field: { alignSelf: 'stretch', marginTop: spacing.sm },
});
