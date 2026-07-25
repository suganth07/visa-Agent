'use client';

import { useWidgetSDK, useTheme } from '@nitrostack/widgets';

/**
 * Visa Pathway Search Results Widget
 *
 * Modern, compact display of visa pathway search results with Nitrocloud branding.
 *
 * TODO(visa-agent): this widget is a terminology migration of the
 * NitroStack Flight Booking OAuth template. Real Visa Agent widgets must
 * follow docs/WIDGETS.md, including approval-state, freshness, and
 * authorization-aware states.
 */

interface PathwayStage {
    origin: string;
    destination: string;
    startAt: string;
    completeAt: string;
    duration: string;
    handoffs: number;
    authority: string;
    referenceNumber: string;
}

interface PathwayOffer {
    id: string;
    feeAmount: string;
    feeCurrency: string;
    primaryStage: PathwayStage;
    returnStage?: PathwayStage;
    caseComplexity: string;
    withdrawable: boolean;
    amendable: boolean;
}

interface PathwaySearchData {
    searchParams: {
        nationality: string;
        destination: string;
        intendedTravelDate: string;
        intendedReturnDate?: string;
        applicants: {
            primaryApplicants: number;
            dependents: number;
            minors: number;
        };
        serviceTier: string;
    };
    totalPathways: number;
    pathways: PathwayOffer[];
}

export default function PathwaySearchResults() {
    const { getToolOutput, callTool } = useWidgetSDK();
    const theme = useTheme();
    const data = getToolOutput<PathwaySearchData>();
    const isDark = theme === 'dark';

    const handlePathwayClick = async (pathwayId: string) => {
        try {
            await callTool('get_pathway_details', { pathwayId });
        } catch (error) {
            console.error('Failed to get pathway details:', error);
        }
    };

    const formatDuration = (duration: string) => {
        const match = duration.match(/PT(\d+H)?(\d+M)?/);
        if (!match) return duration;
        const hours = match[1] ? parseInt(match[1]) : 0;
        const minutes = match[2] ? parseInt(match[2]) : 0;
        return `${hours}h ${minutes}m`;
    };

    const formatTime = (isoString: string) => {
        return new Date(isoString).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        });
    };

    const getAuthorityInitials = (name: string) => {
        return name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
    };

    if (!data?.searchParams) {
        return (
            <div style={{
                padding: '24px',
                textAlign: 'center',
                color: isDark ? '#F8FAFC' : '#020617'
            }}>
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>⚠️</div>
                <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>
                    Invalid Data
                </div>
                <div style={{ fontSize: '14px', color: isDark ? '#94A3B8' : '#64748B' }}>
                    Visa pathway search data is missing
                </div>
            </div>
        );
    }

    const totalApplicants = (data.searchParams.applicants?.primaryApplicants || 0) +
        (data.searchParams.applicants?.dependents || 0) +
        (data.searchParams.applicants?.minors || 0);

    const PathwayStageView = ({ stage, label }: { stage: PathwayStage; label: string }) => (
        <div style={{
            background: isDark ? '#0F172A' : '#F8FAFC',
            borderRadius: '8px',
            padding: '12px',
            marginBottom: '8px'
        }}>
            <div style={{
                fontSize: '12px',
                fontWeight: 600,
                color: '#3B9FFF',
                marginBottom: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
            }}>
                <span>{label === 'Outbound' ? '📄' : '🔄'}</span>
                <span>{label}</span>
            </div>

            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto 1fr',
                gap: '12px',
                alignItems: 'center'
            }}>
                <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: isDark ? '#F8FAFC' : '#020617' }}>
                        {formatTime(stage.startAt)}
                    </div>
                    <div style={{ fontSize: '12px', color: isDark ? '#94A3B8' : '#64748B', marginTop: '2px' }}>
                        {stage.origin}
                    </div>
                </div>

                <div style={{
                    textAlign: 'center',
                    padding: '8px',
                    background: isDark ? '#1E293B' : 'white',
                    borderRadius: '6px',
                    minWidth: '100px'
                }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: isDark ? '#F8FAFC' : '#020617' }}>
                        {formatDuration(stage.duration)}
                    </div>
                    <div style={{
                        height: '2px',
                        background: 'linear-gradient(90deg, #3B9FFF 0%, #2563EB 100%)',
                        margin: '6px 0',
                        position: 'relative'
                    }}>
                        {stage.handoffs > 0 && (
                            <div style={{
                                width: '6px',
                                height: '6px',
                                background: '#3B9FFF',
                                borderRadius: '50%',
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%)'
                            }} />
                        )}
                    </div>
                    <div style={{ fontSize: '10px', color: isDark ? '#94A3B8' : '#64748B' }}>
                        {stage.handoffs === 0 ? 'Direct' : `${stage.handoffs} handoff${stage.handoffs > 1 ? 's' : ''}`}
                    </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: isDark ? '#F8FAFC' : '#020617' }}>
                        {formatTime(stage.completeAt)}
                    </div>
                    <div style={{ fontSize: '12px', color: isDark ? '#94A3B8' : '#64748B', marginTop: '2px' }}>
                        {stage.destination}
                    </div>
                </div>
            </div>
        </div>
    );

    return (
        <div className={isDark ? 'dark' : ''} style={{
            padding: '16px',
            background: isDark ? '#020617' : '#FFFFFF',
            color: isDark ? '#F8FAFC' : '#020617'
        }}>
            {/* Header */}
            <div style={{
                background: isDark ? '#0F172A' : '#F8FAFC',
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '16px',
                border: `1px solid ${isDark ? '#334155' : '#E2E8F0'}`
            }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px',
                    marginBottom: '12px'
                }}>
                    <div style={{
                        fontSize: '18px',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}>
                        <span>{data.searchParams.nationality}</span>
                        <span style={{ color: '#3B9FFF' }}>→</span>
                        <span>{data.searchParams.destination}</span>
                    </div>

                    <div className="badge badge-info">
                        {data.totalPathways} pathways
                    </div>
                </div>

                <div style={{
                    display: 'flex',
                    gap: '16px',
                    flexWrap: 'wrap',
                    fontSize: '12px',
                    color: isDark ? '#94A3B8' : '#64748B'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>📅</span>
                        <span>
                            {formatDate(data.searchParams.intendedTravelDate)}
                            {data.searchParams.intendedReturnDate && ` - ${formatDate(data.searchParams.intendedReturnDate)}`}
                        </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>👥</span>
                        <span>{totalApplicants} applicant{totalApplicants !== 1 ? 's' : ''}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>🏷️</span>
                        <span>{(data.searchParams.serviceTier || 'standard').replace('_', ' ')}</span>
                    </div>
                </div>
            </div>

            {/* Pathway Offers */}
            {data.pathways.length > 0 ? (
                <div style={{
                    display: 'flex',
                    gap: '12px',
                    overflowX: 'auto',
                    paddingBottom: '12px',
                    scrollbarWidth: 'thin',
                    scrollbarColor: isDark ? '#334155 #0F172A' : '#CBD5E1 #F1F5F9'
                }}>
                    {data.pathways.map((pathway) => (
                        <div key={pathway.id} style={{
                            minWidth: '320px',
                            maxWidth: '320px',
                            background: isDark ? '#1a1a1a' : '#ffffff',
                            border: `1px solid ${isDark ? '#333' : '#e5e7eb'}`,
                            borderRadius: '12px',
                            padding: '16px',
                            boxShadow: isDark ? '0 2px 8px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.1)',
                            transition: 'all 0.2s ease',
                            cursor: 'pointer'
                        }}
                            onClick={() => handlePathwayClick(pathway.id)}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.transform = 'translateY(-2px)';
                                e.currentTarget.style.boxShadow = isDark
                                    ? '0 4px 12px rgba(59, 159, 255, 0.2)'
                                    : '0 4px 12px rgba(59, 159, 255, 0.15)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = isDark
                                    ? '0 2px 8px rgba(0,0,0,0.3)'
                                    : '0 2px 8px rgba(0,0,0,0.1)';
                            }}>
                            {/* Pathway Header */}
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: '12px',
                                paddingBottom: '12px',
                                borderBottom: `1px solid ${isDark ? '#334155' : '#E2E8F0'}`
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <div style={{
                                        width: '40px',
                                        height: '40px',
                                        background: 'linear-gradient(135deg, #3B9FFF 0%, #2563EB 100%)',
                                        borderRadius: '8px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: 'white',
                                        fontWeight: 700,
                                        fontSize: '14px'
                                    }}>
                                        {getAuthorityInitials(pathway.primaryStage.authority)}
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '14px', fontWeight: 600 }}>
                                            {pathway.primaryStage.authority}
                                        </div>
                                        <div style={{ fontSize: '11px', color: isDark ? '#94A3B8' : '#64748B' }}>
                                            {pathway.primaryStage.referenceNumber}
                                        </div>
                                    </div>
                                </div>

                                <div style={{ textAlign: 'right' }}>
                                    <div style={{
                                        color: 'var(--primary)',
                                        fontSize: '24px',
                                        fontWeight: 700
                                    }}>
                                        {pathway.feeCurrency} {parseFloat(pathway.feeAmount).toFixed(0)}
                                    </div>
                                    <div style={{ fontSize: '10px', color: isDark ? '#94A3B8' : '#64748B' }}>
                                        Fee
                                    </div>
                                </div>
                            </div>

                            {/* Pathway Stages */}
                            <PathwayStageView stage={pathway.primaryStage} label="Outbound" />
                            {pathway.returnStage && <PathwayStageView stage={pathway.returnStage} label="Return" />}

                            {/* Badges */}
                            <div style={{
                                display: 'flex',
                                gap: '6px',
                                flexWrap: 'wrap',
                                marginTop: '12px'
                            }}>
                                <span className={pathway.withdrawable ? 'badge badge-success' : 'badge badge-warning'}>
                                    {pathway.withdrawable ? '✓ Withdrawable' : '✗ Non-withdrawable'}
                                </span>
                                {pathway.amendable && (
                                    <span className="badge badge-success">✓ Amendable</span>
                                )}
                                <span className="badge badge-info">{pathway.caseComplexity}</span>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div style={{
                    background: isDark ? '#0F172A' : '#F8FAFC',
                    borderRadius: '12px',
                    padding: '32px',
                    textAlign: 'center'
                }}>
                    <div style={{ fontSize: '48px', marginBottom: '12px' }}>📄</div>
                    <div style={{ fontSize: '14px', color: isDark ? '#94A3B8' : '#64748B' }}>
                        No visa pathways found. Try adjusting your search.
                    </div>
                </div>
            )}
        </div>
    );
}
