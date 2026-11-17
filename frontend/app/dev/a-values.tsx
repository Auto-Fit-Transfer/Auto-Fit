import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { PaperValuesView } from '@/src/components/a/PaperValuesView';

// Development only: renewal A's "읽은 수치 확인" with sample values (the design's own: a-docs.html), to
// look at it without signing in. ?state=checkup (the fifteen values of a health check, one not read)
const nothing = () => undefined;
const inbody = [
  ['검사일', '2026.11.03', ''], ['신장', '163.0', 'cm'], ['체중', '55.0', 'kg'], ['골격근량', '21.4', 'kg'], ['체지방량', '14.5', 'kg'],
  ['체지방률', '26.4', '%'], ['BMI', '20.7', ''], ['기초대사량', '1,245', 'kcal'], ['내장지방레벨', '5', ''],
];
const checkup = [
  ['검진일', '2026.09.14', ''], ['키', '163.0', 'cm'], ['몸무게', '56.2', 'kg'], ['BMI', '21.2', ''], ['혈압', '112 / 72', 'mmHg'],
  ['공복혈당', '92', 'mg/dL'], ['총콜레스테롤', '', 'mg/dL'], ['혈색소', '13.1', 'g/dL'], ['HDL 콜레스테롤', '58', 'mg/dL'], ['LDL 콜레스테롤', '104', 'mg/dL'],
  ['중성지방', '88', 'mg/dL'], ['AST', '21', 'U/L'], ['ALT', '17', 'U/L'], ['감마지티피', '15', 'U/L'], ['혈청 크레아티닌', '0.7', 'mg/dL'],
];

export default function AValuesSample() {
  const { state } = useLocalSearchParams<{ state?: string }>();
  const [kind, setKind] = useState(state === 'checkup' ? 'health_checkup' : 'body_composition');
  const rows = kind === 'health_checkup' ? checkup : inbody;
  return (
    <PaperValuesView
      busy={false}
      canEdit
      cells={rows.map(([label, value, unit]) => ({ key: label, label, unit, value }))}
      fileName={kind === 'health_checkup' ? '건강검진 결과표.pdf' : '인바디 결과지.jpg'}
      fileTime="2026.11.03 08:12"
      kinds={[
        { has: true, label: '건강검진', on: kind === 'health_checkup', type: 'health_checkup' },
        { has: true, label: '인바디', on: kind === 'body_composition', type: 'body_composition' },
      ]}
      next={{ disabled: false, label: '다음' }}
      note="읽어 온 수치는 분석과 추천에만 써요."
      onBack={nothing}
      onCell={nothing}
      onHome={nothing}
      onKind={setKind}
      onNext={nothing}
      onReupload={nothing}
      previewUri={null}
    />
  );
}
