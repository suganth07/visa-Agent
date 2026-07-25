'use client';

import { useWidgetSDK, useTheme } from '@nitrostack/widgets';

/**
 * Jurisdiction Search Widget
 *
 * Compact display of jurisdiction search results with codes and locations.
 *
 * TODO(visa-agent): this widget is a terminology migration of the
 * NitroStack Flight Booking OAuth template. Real Visa Agent widgets must
 * follow docs/WIDGETS.md.
 */

interface JurisdictionResult {
    id: string;
    name: string;
    code: string;
    regionCode?: string;
    region?: string;
    type: string;
    latitude?: number;
    longitude?: number;
    timeZone?: string;
}

interface JurisdictionSearchData {
    query: string;
    results: JurisdictionResult[];
}

export default function JurisdictionSearch() {
    const { getToolOutput } = useWidgetSDK();
    const theme = useTheme();
    const data = getToolOutput<JurisdictionSearchData>();

    const isDark = theme === 'dark';

    const getTypeIcon = (type: string) => {
        const icons: Record<string, string> = {
            'jurisdiction': '🏛️',
            'city': '🏙️',
            'region': '🗺️',
            'consulate': '🏢',
            'embassy': '🏛️'
        };
        return icons[type] || '📍';
    };

    if (!data) {
        return (
            <div style={{ padding: '24px', textAlign: 'center', color: isDark ? '#F8FAFC' : '#020617' }}>
                Loading...
            </div>
        );
    }

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
                    gap: '10px',
                    marginBottom: '8px'
                }}>
                    <span style={{ fontSize: '24px' }}>🔍</span>
                    <h2 style={{
                        margin: 0,
                        fontSize: '18px',
                        fontWeight: 700
                    }}>
                        Jurisdiction Search
                    </h2>
                </div>
                <p style={{
                    margin: '8px 0 0 34px',
                    fontSize: '14px',
                    color: isDark ? '#94A3B8' : '#64748B'
                }}>
                    Searching: <strong>"{data.query}"</strong>
                </p>
                <div style={{
                    marginTop: '8px',
                    marginLeft: '34px',
                    fontSize: '12px',
                    color: isDark ? '#94A3B8' : '#64748B'
                }}>
                    {data.results.length} result{data.results.length !== 1 ? 's' : ''}
                </div>
            </div>

            {/* Results */}
            {data.results.length > 0 ? (
                <div style={{
                    display: 'flex',
                    gap: '12px',
                    overflowX: 'auto',
                    paddingBottom: '12px',
                    scrollbarWidth: 'thin',
                    scrollbarColor: isDark ? '#334155 #0F172A' : '#CBD5E1 #F1F5F9'
                }}>
                    {data.results.map((jurisdiction) => (
                        <div key={jurisdiction.id} style={{
                            minWidth: '300px',
                            maxWidth: '300px',
                            background: isDark ? '#1a1a1a' : '#ffffff',
                            border: `1px solid ${isDark ? '#333' : '#e5e7eb'}`,
                            borderRadius: '12px',
                            padding: '16px',
                            boxShadow: isDark ? '0 2px 8px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.1)',
                            transition: 'all 0.2s ease',
                            cursor: 'pointer'
                        }}
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
                                    : '0 4px 12px rgba(0,0,0,0.1)';
                            }}>
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'flex-start',
                                gap: '12px'
                            }}>
                                {/* Left side */}
                                <div style={{ flex: 1 }}>
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        marginBottom: '6px'
                                    }}>
                                        <span style={{ fontSize: '20px' }}>
                                            {getTypeIcon(jurisdiction.type)}
                                        </span>
                                        <div>
                                            <h3 style={{
                                                margin: 0,
                                                fontSize: '16px',
                                                fontWeight: 600
                                            }}>
                                                {jurisdiction.name}
                                            </h3>
                                            {jurisdiction.region && (
                                                <p style={{
                                                    margin: '2px 0 0 0',
                                                    fontSize: '12px',
                                                    color: isDark ? '#94A3B8' : '#64748B'
                                                }}>
                                                    📍 {jurisdiction.region}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Additional details */}
                                    <div style={{
                                        display: 'flex',
                                        gap: '12px',
                                        marginTop: '8px',
                                        flexWrap: 'wrap',
                                        fontSize: '11px',
                                        color: isDark ? '#94A3B8' : '#64748B'
                                    }}>
                                        {jurisdiction.timeZone && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <span>🕐</span>
                                                <span>{jurisdiction.timeZone}</span>
                                            </div>
                                        )}
                                        {jurisdiction.latitude && jurisdiction.longitude && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <span>🌍</span>
                                                <span>{jurisdiction.latitude.toFixed(2)}, {jurisdiction.longitude.toFixed(2)}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Right side - Codes */}
                                <div style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '6px',
                                    alignItems: 'flex-end'
                                }}>
                                    {/* Jurisdiction Code */}
                                    <div style={{
                                        background: 'var(--primary)',
                                        color: 'white',
                                        padding: '6px 12px',
                                        borderRadius: '8px',
                                        fontWeight: 700,
                                        fontSize: '16px',
                                        letterSpacing: '0.5px'
                                    }}>
                                        {jurisdiction.code || 'N/A'}
                                    </div>

                                    {/* Region Code */}
                                    {jurisdiction.regionCode && (
                                        <div style={{
                                            background: isDark ? '#1E293B' : '#F1F5F9',
                                            color: isDark ? '#CBD5E1' : '#475569',
                                            padding: '3px 10px',
                                            borderRadius: '6px',
                                            fontSize: '10px',
                                            fontWeight: 600
                                        }}>
                                            Region: {jurisdiction.regionCode}
                                        </div>
                                    )}

                                    {/* Type badge */}
                                    <div className="badge badge-info" style={{ fontSize: '10px' }}>
                                        {jurisdiction.type.replace('_', ' ')}
                                    </div>
                                </div>
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
                    <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔍</div>
                    <div style={{ fontSize: '16px', marginBottom: '6px' }}>
                        No jurisdictions found
                    </div>
                    <div style={{ fontSize: '12px', color: isDark ? '#94A3B8' : '#64748B' }}>
                        Try a different country or jurisdiction code
                    </div>
                </div>
            )}

            {/* Help text */}
            <div style={{
                background: isDark ? '#0F172A' : '#F8FAFC',
                borderRadius: '8px',
                padding: '12px',
                marginTop: '12px',
                fontSize: '11px',
                color: isDark ? '#94A3B8' : '#64748B',
                textAlign: 'center',
                border: `1px solid ${isDark ? '#334155' : '#E2E8F0'}`
            }}>
                💡 <strong>Tip:</strong> Use the jurisdiction code for visa pathway searches
            </div>
        </div>
    );
}
