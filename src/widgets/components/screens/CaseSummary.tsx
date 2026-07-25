'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { api, toErrorMessage } from '../../lib/mcp';
import { formatDateTime, shortId } from '../../lib/format';
import type { CaseGetOutput } from '../../lib/types';
import {
  Actions,
  Alert,
  Badge,
  Button,
  Card,
  DataRow,
  ScreenHeader,
  SkeletonRows,
  SuccessCheck,
} from '../ui';

/**
 * Screen 3 — Case Summary.
 *
 * Always re-reads the case through `case_get` so the screen reflects server
 * state rather than whatever the previous step happened to hold.
 */
export function CaseSummary({
  caseId,
  onContinue,
  onBack,
  celebrate,
}: {
  caseId: string;
  onContinue: (record: CaseGetOutput) => void;
  onBack: () => void;
  celebrate?: boolean;
}) {
  const [record, setRecord] = useState<CaseGetOutput | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRecord(await api.caseGet(caseId));
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card>
      <ScreenHeader
        title="Your case"
        subtitle="Details we read from your description."
        action={record ? <Badge tone="brand">{record.status}</Badge> : undefined}
      />

      {loading && <SkeletonRows rows={5} />}

      {!loading && error && (
        <Alert
          tone="error"
          title="Couldn't load your case"
          action={
            <Button variant="secondary" onClick={() => void load()}>
              Try again
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {!loading && !error && record && (
        <>
          {celebrate && (
            <div style={{ margin: '4px 0 22px' }}>
              <SuccessCheck />
              <p
                style={{
                  textAlign: 'center',
                  margin: '13px 0 0',
                  fontWeight: 650,
                  fontSize: 15.5,
                }}
              >
                Case created
              </p>
            </div>
          )}

          <div className="me-animate-in">
            <DataRow label="Case reference" value={<code style={{ fontFamily: 'var(--me-mono)', fontSize: 13 }}>{shortId(record.caseId)}</code>} />
            <DataRow label="Nationality" value={record.nationality} />
            <DataRow label="Destination" value={record.destinationCountry} />
            <DataRow label="Visa type" value={record.visaType} />
            <DataRow label="Status" value={record.status} />
            <DataRow label="Created" value={formatDateTime(record.createdAt)} />
          </div>

          <div style={{ marginTop: 18 }}>
            <Alert tone="info" title="Next step">
              {record.nextStep}
            </Alert>
          </div>

          <Actions>
            <Button variant="secondary" onClick={onBack}>
              Back
            </Button>
            <Button onClick={() => onContinue(record)}>See my checklist →</Button>
          </Actions>
        </>
      )}
    </Card>
  );
}
