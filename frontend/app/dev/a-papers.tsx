import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { PapersView, type PaperFilter } from '@/src/components/a/PapersView';
import { PaperFailed, PaperReading } from '@/src/components/a/PaperWait';
import { HealthDataUploadBottomSheet } from '@/src/components/health-data/HealthDataUploadBottomSheet';

// Development only: renewal A's 건강 서류 with sample papers, to look at the screen.
// ?state=empty | loading | reading | failed | sheet (the box for adding a paper)
const nothing = () => undefined;
const papers = [
  { id: '3', kind: '인바디', type: 'body_composition', given: '11월 11일 올림' },
  { id: '2', kind: '인바디', type: 'body_composition', given: '11월 3일 올림' },
  { id: '1', kind: '건강검진', type: 'health_checkup', given: '9월 14일 올림' },
];

export default function APapersSample() {
  const { state } = useLocalSearchParams<{ state?: string }>();
  const [filter, setFilter] = useState<PaperFilter>('all');
  const [newestFirst, setNewestFirst] = useState(true);
  const [sheet, setSheet] = useState(state === 'sheet');
  if (state === 'reading') return <PaperReading onBack={nothing} />;
  if (state === 'failed') return <PaperFailed busy={false} onBack={nothing} onFile={nothing} onPhoto={nothing} uploading={false} />;
  const none = state === 'empty' || state === 'loading';
  const rows = papers.filter((paper) => filter === 'all' || paper.type === filter);
  return (
    <>
      <PapersView
        filter={filter}
        loading={state === 'loading'}
        newestFirst={newestFirst}
        numbers={
          none
            ? []
            : [
                { kind: '인바디', day: '11월 11일', items: [{ label: '키', value: '163.0', unit: 'cm' }, { label: '체중', value: '55.0', unit: 'kg' }, { label: '체지방률', value: '27.1', unit: '%' }] },
                { kind: '건강검진', day: '9월 12일', items: [{ label: '혈압', value: '118/76', unit: '' }, { label: '공복혈당', value: '104', unit: 'mg/dL' }, { label: '총콜레스테롤', value: '', unit: 'mg/dL' }] },
              ]
        }
        onAdd={() => setSheet(true)}
        onBack={nothing}
        onFilter={setFilter}
        onSort={() => setNewestFirst((value) => !value)}
        rows={none ? [] : newestFirst ? rows : [...rows].reverse()}
        total={none ? 0 : papers.length}
      />
      <HealthDataUploadBottomSheet onClose={() => setSheet(false)} onSelectFile={nothing} visible={sheet} />
    </>
  );
}
