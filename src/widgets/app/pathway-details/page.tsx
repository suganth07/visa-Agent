'use client';

import { useWidgetSDK, useTheme } from '@nitrostack/widgets';

/**
 * Visa Pathway Details Widget - Compact view with processing steps,
 * required documents, and case conditions.
 *
 * TODO(visa-agent): this widget is a terminology migration of the
 * NitroStack Flight Booking OAuth template. Real Visa Agent widgets must
 * follow docs/WIDGETS.md.
 */

interface Step {
    id: string;
    origin: string;
    destination: string;
    startAt: string;
    completeAt: string;
    duration: string;
    authority: { name: string; code: string; referenceNumber: string };
    processingFacility?: string;
}

interface Stage {
    origin: { code: string; name: string; region: string };
    destination: { code: string; name: string; region: string };
    duration: string;
    steps: Step[];
}

interface PathwayDetailsData {
    id: string;
    feeAmount: string;
    feeCurrency: string;
    stages: Stage[];
    applicants: Array<{ id: string; type: string; requiredDocuments?: Array<{ type: string; quantity: number }> }>;
    conditions: {
        withdrawalBeforeSubmission: { allowed: boolean; penaltyAmount?: string; penaltyCurrency?: string };
        amendmentBeforeSubmission: { allowed: boolean; penaltyAmount?: string; penaltyCurrency?: string };
    };
}

export default function PathwayDetails() {
    const { getToolOutput } = useWidgetSDK();
    const theme = useTheme();
    const data = getToolOutput<PathwayDetailsData>();

    const isDark = theme === 'dark';

    const formatDuration = (duration: string) => {
        const match = duration.match(/PT(\d+H)?(\d+M)?/);
        if (!match) return duration;
        const hours = match[1] ? parseInt(match[1]) : 0;
        const minutes = match[2] ? parseInt(match[2]) : 0;
        return `${hours}h ${minutes}m`;
    };

    const formatTime = (isoString: string) => {
        const date = new Date(isoString);
        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    };

    const formatDate = (isoString: string) => {
        const date = new Date(isoString);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    if (!data) {
        return <div style={{ padding: '24px', textAlign: 'center' }}>Loading...</div>;
    }

    return (
        <div className={isDark ? 'dark' : ''} style={{
            padding: '16px',
            background: isDark ? '#020617' : '#FFFFFF',
            color: isDark ? '#F8FAFC' : '#020617'
        }}>
            {/* Header */}
            <div className="card" style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>Visa Pathway Details</h2>
                        <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: isDark ? '#94A3B8' : '#64748B' }}>
                            Pathway ID: {data.id}
                        </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ color: 'var(--primary)', fontSize: '24px', fontWeight: 700 }}>
                            {data.feeCurrency} {parseFloat(data.feeAmount).toFixed(2)}
                        </div>
                        <div style={{ fontSize: '10px', color: isDark ? '#94A3B8' : '#64748B' }}>Total Fee</div>
                    </div>
                </div>
            </div>

            {/* Processing Itinerary */}
            {data.stages.map((stage, stageIndex) => (
                <div key={stageIndex} className="card" style={{ marginBottom: '12px' }}>
                    <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>📄</span>
                        <span>{stage.origin.region} → {stage.destination.region}</span>
                    </h3>

                    <div style={{
                        background: isDark ? '#0F172A' : '#F8FAFC',
                        borderRadius: '8px',
                        padding: '12px',
                        marginBottom: '12px',
                        fontSize: '12px',
                        textAlign: 'center',
                        color: '#3B9FFF',
                        fontWeight: 600
                    }}>
                        Duration: {formatDuration(stage.duration)}
                    </div>

                    {/* Steps */}
                    {stage.steps.map((step) => (
                        <div key={step.id} style={{
                            background: isDark ? '#1F2937' : '#F9FAFB',
                            borderRadius: '8px',
                            padding: '12px',
                            marginBottom: '8px',
                            border: `1px solid ${isDark ? '#334155' : '#E2E8F0'}`
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                                <div style={{ fontSize: '14px', fontWeight: 600 }}>
                                    {step.authority.name} {step.authority.referenceNumber}
                                </div>
                                <div style={{ fontSize: '11px', color: isDark ? '#94A3B8' : '#64748B' }}>
                                    {formatDuration(step.duration)}
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '12px', alignItems: 'center' }}>
                                <div>
                                    <div style={{ fontSize: '18px', fontWeight: 700 }}>{formatTime(step.startAt)}</div>
                                    <div style={{ fontSize: '12px', color: isDark ? '#94A3B8' : '#64748B', marginTop: '2px' }}>
                                        {step.origin}
                                    </div>
                                    <div style={{ fontSize: '10px', color: isDark ? '#64748B' : '#94A3B8', marginTop: '2px' }}>
                                        {formatDate(step.startAt)}
                                    </div>
                                </div>

                                <div style={{
                                    width: '40px',
                                    height: '2px',
                                    background: 'linear-gradient(90deg, #3B9FFF 0%, #2563EB 100%)',
                                    position: 'relative'
                                }}>
                                    <div style={{
                                        position: 'absolute',
                                        right: '-4px',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        width: 0,
                                        height: 0,
                                        borderLeft: '6px solid #2563EB',
                                        borderTop: '3px solid transparent',
                                        borderBottom: '3px solid transparent'
                                    }} />
                                </div>

                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '18px', fontWeight: 700 }}>{formatTime(step.completeAt)}</div>
                                    <div style={{ fontSize: '12px', color: isDark ? '#94A3B8' : '#64748B', marginTop: '2px' }}>
                                        {step.destination}
                                    </div>
                                    <div style={{ fontSize: '10px', color: isDark ? '#64748B' : '#94A3B8', marginTop: '2px' }}>
                                        {formatDate(step.completeAt)}
                                    </div>
                                </div>
                            </div>

                            {step.processingFacility && (
                                <div style={{
                                    marginTop: '10px',
                                    paddingTop: '10px',
                                    borderTop: `1px solid ${isDark ? '#334155' : '#E2E8F0'}`,
                                    fontSize: '11px',
                                    color: isDark ? '#94A3B8' : '#64748B'
                                }}>
                                    📍 {step.processingFacility}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            ))}

            {/* Required Documents */}
            <div className="card" style={{ marginBottom: '12px' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>📎</span>
                    <span>Required Documents</span>
                </h3>
                {data.applicants.map((applicant, index) => (
                    <div key={applicant.id} style={{
                        background: isDark ? '#0F172A' : '#F8FAFC',
                        borderRadius: '8px',
                        padding: '12px',
                        marginBottom: index < data.applicants.length - 1 ? '8px' : '0'
                    }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                            Applicant {index + 1} ({applicant.type})
                        </div>
                        {applicant.requiredDocuments && applicant.requiredDocuments.length > 0 ? (
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {applicant.requiredDocuments.map((doc, docIndex) => (
                                    <span key={docIndex} className="badge badge-info" style={{ fontSize: '11px' }}>
                                        {doc.quantity}x {doc.type.replace('_', ' ')}
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <div style={{ fontSize: '11px', color: isDark ? '#94A3B8' : '#64748B' }}>
                                No document requirements listed
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Case Conditions */}
            {data.conditions && (
                <div className="card">
                    <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>📋</span>
                        <span>Case Conditions</span>
                    </h3>
                    <div style={{ display: 'grid', gap: '8px' }}>
                        <div className={data.conditions.withdrawalBeforeSubmission?.allowed ? 'badge-success' : 'badge-warning'} style={{
                            padding: '12px',
                            borderRadius: '8px'
                        }}>
                            <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                                {data.conditions.withdrawalBeforeSubmission?.allowed ? '✓' : '✗'} Withdrawal Before Submission
                            </div>
                            {data.conditions.withdrawalBeforeSubmission?.penaltyAmount && (
                                <div style={{ fontSize: '10px', opacity: 0.8 }}>
                                    Penalty: {data.conditions.withdrawalBeforeSubmission.penaltyCurrency} {data.conditions.withdrawalBeforeSubmission.penaltyAmount}
                                </div>
                            )}
                        </div>

                        <div className={data.conditions.amendmentBeforeSubmission?.allowed ? 'badge-success' : 'badge-warning'} style={{
                            padding: '12px',
                            borderRadius: '8px'
                        }}>
                            <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                                {data.conditions.amendmentBeforeSubmission?.allowed ? '✓' : '✗'} Amendments Before Submission
                            </div>
                            {data.conditions.amendmentBeforeSubmission?.penaltyAmount && (
                                <div style={{ fontSize: '10px', opacity: 0.8 }}>
                                    Penalty: {data.conditions.amendmentBeforeSubmission.penaltyCurrency} {data.conditions.amendmentBeforeSubmission.penaltyAmount}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
