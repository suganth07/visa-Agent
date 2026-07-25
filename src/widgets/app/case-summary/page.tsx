'use client';

import { useWidgetSDK, useTheme } from '@nitrostack/widgets';

/**
 * Case Summary Widget - Compact case confirmation
 *
 * TODO(visa-agent): this widget is a terminology migration of the
 * NitroStack Flight Booking OAuth template. Real Visa Agent widgets must
 * follow docs/WIDGETS.md, including approval-pending and blocked states.
 */

interface CaseData {
    caseId: string;
    status: string;
    referenceNumber?: string;
    feeAmount: string;
    feeCurrency: string;
    createdAt?: string;
    expiresAt?: string;
    applicants: Array<{ id: string; name: string; type: string; email?: string }>;
    stages: Array<{
        origin: { code: string; region?: string };
        destination: { code: string; region?: string };
        steps?: Array<{ authority: string; referenceNumber: string }>;
    }>;
    message?: string;
}

export default function CaseSummary() {
    const { getToolOutput } = useWidgetSDK();
    const theme = useTheme();
    const data = getToolOutput<CaseData>();

    const isDark = theme === 'dark';

    const formatDateTime = (isoString: string) => {
        return new Date(isoString).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const getStatusIcon = (status: string) => {
        return { 'submitted': '🎉', 'initiated': '⏱️', 'withdrawn': '✗', 'pending': '⋯' }[status.toLowerCase()] || '📋';
    };

    if (!data) {
        return <div style={{ padding: '24px', textAlign: 'center' }}>Loading...</div>;
    }

    return (
        <div className={isDark ? 'dark' : ''} style={{
            padding: '16px',
            background: isDark ? '#020617' : '#ffffff',
            color: isDark ? '#F8FAFC' : '#020617'
        }}>
            {/* Header */}
            <div className="card" style={{ marginBottom: '16px', textAlign: 'center' }}>
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>
                    {getStatusIcon(data.status)}
                </div>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>
                    {data.status === 'submitted' ? 'Case Submitted!' :
                        data.status === 'initiated' ? 'Case Initiated' : 'Case Summary'}
                </h2>

                {data.referenceNumber && (
                    <div style={{ fontSize: '14px', color: isDark ? '#94A3B8' : '#64748B', marginBottom: '12px' }}>
                        Reference: <strong style={{ color: "var(--primary)", fontWeight: 700 }}>{data.referenceNumber}</strong>
                    </div>
                )}

                <div className={`badge badge-${data.status === 'submitted' ? 'success' : data.status === 'initiated' ? 'warning' : 'info'}`}>
                    {data.status.toUpperCase()}
                </div>

                {data.message && (
                    <div style={{
                        marginTop: '12px',
                        padding: '10px',
                        background: isDark ? '#0F172A' : '#0F172A',
                        borderRadius: '6px',
                        fontSize: '12px'
                    }}>
                        {data.message}
                    </div>
                )}

                {data.expiresAt && data.status === 'initiated' && (
                    <div style={{
                        marginTop: '12px',
                        padding: '12px',
                        background: '#FEF3C7',
                        borderRadius: '8px',
                        border: '1px solid #F59E0B'
                    }}>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: '#92400E', marginBottom: '4px' }}>
                            ⏰ Fee Payment Required
                        </div>
                        <div style={{ fontSize: '10px', color: '#78350F' }}>
                            Complete before: <strong>{formatDateTime(data.expiresAt)}</strong>
                        </div>
                    </div>
                )}
            </div>

            {/* Case Info */}
            <div className="card" style={{ marginBottom: '12px' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600 }}>Case Information</h3>
                <div style={{ display: 'grid', gap: '8px', fontSize: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: isDark ? '#94A3B8' : '#64748B' }}>Case ID:</span>
                        <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{data.caseId}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: `1px solid ${isDark ? '#334155' : '#E2E8F0'}` }}>
                        <span style={{ color: isDark ? '#94A3B8' : '#64748B' }}>Fee:</span>
                        <span style={{ color: 'var(--primary)', fontWeight: 700, fontSize: '16px' }}>
                            {data.feeCurrency} {parseFloat(data.feeAmount).toFixed(2)}
                        </span>
                    </div>
                    {data.createdAt && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                            <span style={{ color: isDark ? '#94A3B8' : '#64748B' }}>Created:</span>
                            <span>{formatDateTime(data.createdAt)}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Applicants */}
            <div className="card" style={{ marginBottom: '12px' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>👥</span>
                    <span>Applicants ({data.applicants.length})</span>
                </h3>
                <div style={{ display: 'grid', gap: '8px' }}>
                    {data.applicants.map((applicant, index) => (
                        <div key={applicant.id} style={{
                            padding: '12px',
                            background: isDark ? '#0F172A' : '#0F172A',
                            borderRadius: '8px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <div>
                                <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '2px' }}>
                                    {applicant.name}
                                </div>
                                <div style={{ fontSize: '11px', color: isDark ? '#94A3B8' : '#64748B' }}>
                                    {applicant.type}
                                </div>
                                {applicant.email && (
                                    <div style={{ fontSize: '10px', color: isDark ? '#94A3B8' : '#64748B', marginTop: '2px' }}>
                                        📧 {applicant.email}
                                    </div>
                                )}
                            </div>
                            <div style={{
                                background: 'var(--primary)',
                                color: 'white',
                                width: '28px',
                                height: '28px',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',

                                fontWeight: 700,
                                fontSize: '12px'
                            }}>
                                {index + 1}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Processing Itinerary */}
            <div className="card">
                <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>📄</span>
                    <span>Processing Itinerary</span>
                </h3>
                <div style={{ display: 'grid', gap: '12px' }}>
                    {data.stages.map((stage, index) => (
                        <div key={index} style={{
                            padding: '12px',
                            background: isDark ? '#0F172A' : '#F8FAFC',
                            borderRadius: '8px'
                        }}>
                            <div style={{ fontSize: '12px', fontWeight: 600, color: '#3B9FFF', marginBottom: '10px' }}>
                                {index === 0 ? 'Outbound' : 'Return'} Stage
                            </div>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr auto 1fr',
                                gap: '12px',
                                alignItems: 'center'
                            }}>
                                <div>
                                    <div style={{ fontSize: '16px', fontWeight: 700 }}>
                                        {stage.origin.code}
                                    </div>
                                    {stage.origin.region && (
                                        <div style={{ fontSize: '11px', color: isDark ? '#94A3B8' : '#64748B', marginTop: '2px' }}>
                                            {stage.origin.region}
                                        </div>
                                    )}
                                </div>

                                <div style={{
                                    width: '32px',
                                    height: '2px',
                                    background: 'linear-gradient(90deg, #3B9FFF 0%, #2563EB 100%)'
                                }} />

                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '16px', fontWeight: 700 }}>
                                        {stage.destination.code}
                                    </div>
                                    {stage.destination.region && (
                                        <div style={{ fontSize: '11px', color: isDark ? '#94A3B8' : '#64748B', marginTop: '2px' }}>
                                            {stage.destination.region}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {stage.steps && stage.steps.length > 0 && (
                                <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: `1px solid ${isDark ? '#334155' : '#E2E8F0'}` }}>
                                    {stage.steps.map((step, stepIndex) => (
                                        <div key={stepIndex} style={{ fontSize: '11px', color: isDark ? '#94A3B8' : '#64748B', marginBottom: '4px' }}>
                                            {step.authority} {step.referenceNumber}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
