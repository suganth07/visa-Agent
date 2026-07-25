'use client';

import { useWidgetSDK, useTheme } from '@nitrostack/widgets';
import { useState } from 'react';

/**
 * Appointment Slot Selection Widget
 *
 * Interactive appointment slot map with real-time selection for multiple applicants.
 *
 * TODO(visa-agent): this widget is a terminology migration of the
 * NitroStack Flight Booking OAuth template's seat selection widget. Real
 * Visa Agent widgets must follow docs/WIDGETS.md.
 */

interface Slot {
    id: string;
    label: string;
    available: boolean;
    fee?: string;
    type: string;
}

interface TimeBlock {
    blockLabel: string;
    slots: Slot[];
}

interface Center {
    facilityType: string;
    timeBlocks: TimeBlock[];
}

interface AppointmentSlotsData {
    pathwayId: string;
    centers: Center[];
    message?: string;
}

export default function AppointmentSlotSelection() {
    const { getToolOutput } = useWidgetSDK();
    const theme = useTheme();
    const data = getToolOutput<AppointmentSlotsData>();

    const isDark = theme === 'dark';
    const [selectedSlots, setSelectedSlots] = useState<Record<string, string>>({});
    const [activeApplicant, setActiveApplicant] = useState(0);
    const [hoveredSlot, setHoveredSlot] = useState<string | null>(null);

    const applicants = [
        { id: 'app_1', name: 'Applicant 1' },
        { id: 'app_2', name: 'Applicant 2' }
    ];

    const handleSlotClick = (slotId: string, slot: Slot) => {
        if (!slot.available) return;

        const currentApplicantId = applicants[activeApplicant].id;
        const slotOwner = Object.entries(selectedSlots).find(([_, id]) => id === slotId)?.[0];

        if (slotOwner && slotOwner !== currentApplicantId) return;

        setSelectedSlots(prev => {
            const newSelections = { ...prev };
            if (newSelections[currentApplicantId] === slotId) {
                delete newSelections[currentApplicantId];
            } else {
                delete newSelections[currentApplicantId];
                newSelections[currentApplicantId] = slotId;
                if (activeApplicant < applicants.length - 1) {
                    setTimeout(() => setActiveApplicant(activeApplicant + 1), 200);
                }
            }
            return newSelections;
        });
    };

    const getSlotStatus = (slotId: string, slot: Slot) => {
        if (!slot.available) return 'unavailable';
        const owner = Object.entries(selectedSlots).find(([_, id]) => id === slotId)?.[0];
        if (owner) {
            const applicantIndex = applicants.findIndex(a => a.id === owner);
            return applicantIndex === activeApplicant ? 'selected-active' : 'selected-other';
        }
        return 'available';
    };

    const getSlotColor = (status: string) => {
        if (isDark) {
            return {
                'available': '#334155',
                'selected-active': '#3B9FFF',
                'selected-other': '#22C55E',
                'unavailable': '#1E293B'
            }[status] || '#334155';
        }
        return {
            'available': '#E2E8F0',
            'selected-active': '#3B9FFF',
            'selected-other': '#22C55E',
            'unavailable': '#CBD5E1'
        }[status] || '#E2E8F0';
    };

    const calculateTotalFee = () => {
        let total = 0;
        Object.values(selectedSlots).forEach(slotId => {
            data?.centers.forEach(center => {
                center.timeBlocks.forEach(block => {
                    const slot = block.slots.find(s => s.id === slotId);
                    if (slot?.fee) total += parseFloat(slot.fee);
                });
            });
        });
        return total;
    };

    const getSelectedSlotInfo = (applicantId: string) => {
        const slotId = selectedSlots[applicantId];
        if (!slotId || !data) return null;

        for (const center of data.centers) {
            for (const block of center.timeBlocks) {
                const slot = block.slots.find(s => s.id === slotId);
                if (slot) return { slot, block: block.blockLabel };
            }
        }
        return null;
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
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px'
                }}>
                    <div>
                        <h2 style={{
                            margin: 0,
                            fontSize: '18px',
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}>
                            <span>🗓️</span>
                            <span>Select Appointment Slots</span>
                        </h2>
                        <p style={{
                            margin: '4px 0 0 0',
                            fontSize: '12px',
                            color: isDark ? '#94A3B8' : '#64748B'
                        }}>
                            {data.message || 'Choose appointment slots for all applicants'}
                        </p>
                    </div>

                    {Object.keys(selectedSlots).length > 0 && (
                        <div style={{
                            background: 'var(--primary)',
                            color: 'white',
                            padding: '8px 16px',
                            borderRadius: '8px',
                            textAlign: 'center'
                        }}>
                            <div style={{ fontSize: '10px', opacity: 0.9 }}>Total</div>
                            <div style={{ fontSize: '18px', fontWeight: 700 }}>
                                ${calculateTotalFee().toFixed(2)}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '16px' }}>
                {/* Slot Map */}
                <div className="card" style={{ minHeight: '400px' }}>
                    {/* Facility Indicator */}
                    <div style={{
                        textAlign: 'center',
                        marginBottom: '20px',
                        paddingBottom: '12px',
                        borderBottom: `2px dashed ${isDark ? '#334155' : '#E2E8F0'}`
                    }}>
                        <div style={{ fontSize: '24px', marginBottom: '6px' }}>🏢</div>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#3B9FFF' }}>
                            VISA APPLICATION CENTER
                        </div>
                    </div>

                    {data.centers.map((center, centerIndex) => (
                        <div key={centerIndex} style={{ marginBottom: '20px' }}>
                            <div style={{
                                background: 'var(--primary)',
                                color: 'white',
                                padding: '8px 16px',
                                borderRadius: '6px',
                                marginBottom: '12px',
                                fontSize: '12px',
                                fontWeight: 600,
                                textTransform: 'uppercase'
                            }}>
                                {center.facilityType.replace('_', ' ')}
                            </div>

                            <div style={{ display: 'grid', gap: '6px' }}>
                                {center.timeBlocks.map((block) => (
                                    <div key={block.blockLabel} style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'auto 1fr auto',
                                        gap: '12px',
                                        alignItems: 'center'
                                    }}>
                                        <div style={{
                                            width: '48px',
                                            textAlign: 'center',
                                            fontSize: '12px',
                                            fontWeight: 600,
                                            color: isDark ? '#94A3B8' : '#64748B'
                                        }}>
                                            {block.blockLabel}
                                        </div>

                                        <div style={{
                                            display: 'flex',
                                            gap: '6px',
                                            justifyContent: 'center',
                                            flexWrap: 'wrap'
                                        }}>
                                            {block.slots.map((slot) => {
                                                const status = getSlotStatus(slot.id, slot);
                                                const isHovered = hoveredSlot === slot.id;

                                                return (
                                                    <div
                                                        key={slot.id}
                                                        onClick={() => handleSlotClick(slot.id, slot)}
                                                        onMouseEnter={() => setHoveredSlot(slot.id)}
                                                        onMouseLeave={() => setHoveredSlot(null)}
                                                        style={{
                                                            width: '40px',
                                                            height: '40px',
                                                            background: getSlotColor(status),
                                                            borderRadius: '6px',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            cursor: slot.available ? 'pointer' : 'not-allowed',
                                                            transition: 'all 0.2s ease',
                                                            transform: isHovered && slot.available ? 'scale(1.1)' : 'scale(1)',
                                                            border: status === 'selected-active' ? '2px solid #fff' : 'none',
                                                            position: 'relative',
                                                            opacity: slot.available ? 1 : 0.4
                                                        }}
                                                    >
                                                        <span style={{ fontSize: '16px' }}>🗓️</span>
                                                        <div style={{
                                                            position: 'absolute',
                                                            bottom: '2px',
                                                            fontSize: '8px',
                                                            fontWeight: 600,
                                                            color: status.includes('selected') ? 'white' : isDark ? '#94A3B8' : '#64748B'
                                                        }}>
                                                            {slot.label}
                                                        </div>
                                                        {slot.fee && parseFloat(slot.fee) > 0 && isHovered && (
                                                            <div style={{
                                                                position: 'absolute',
                                                                top: '-20px',
                                                                background: '#1a202c',
                                                                color: 'white',
                                                                padding: '3px 6px',
                                                                borderRadius: '4px',
                                                                fontSize: '10px',
                                                                fontWeight: 600,
                                                                whiteSpace: 'nowrap'
                                                            }}>
                                                                ${slot.fee}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        <div style={{
                                            width: '48px',
                                            textAlign: 'center',
                                            fontSize: '12px',
                                            fontWeight: 600,
                                            color: isDark ? '#94A3B8' : '#64748B'
                                        }}>
                                            {block.blockLabel}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}

                    {/* Legend */}
                    <div style={{
                        marginTop: '20px',
                        paddingTop: '16px',
                        borderTop: `2px dashed ${isDark ? '#334155' : '#E2E8F0'}`,
                        display: 'flex',
                        gap: '16px',
                        flexWrap: 'wrap',
                        justifyContent: 'center',
                        fontSize: '11px'
                    }}>
                        {[
                            { label: 'Available', color: isDark ? '#334155' : '#E2E8F0' },
                            { label: 'Your Slot', color: '#3B9FFF' },
                            { label: 'Other', color: '#22C55E' },
                            { label: 'Taken', color: isDark ? '#1E293B' : '#CBD5E1' }
                        ].map(item => (
                            <div key={item.label} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}>
                                <div style={{
                                    width: '20px',
                                    height: '20px',
                                    background: item.color,
                                    borderRadius: '4px'
                                }} />
                                <span style={{ color: isDark ? '#94A3B8' : '#64748B' }}>
                                    {item.label}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Sidebar */}
                <div style={{ display: 'grid', gap: '12px', alignContent: 'start' }}>
                    {/* Applicants */}
                    <div className="card">
                        <h3 style={{
                            margin: '0 0 12px 0',
                            fontSize: '14px',
                            fontWeight: 600
                        }}>
                            Applicants
                        </h3>

                        <div style={{ display: 'grid', gap: '8px' }}>
                            {applicants.map((applicant, index) => {
                                const slotInfo = getSelectedSlotInfo(applicant.id);
                                const isActive = activeApplicant === index;

                                return (
                                    <div
                                        key={applicant.id}
                                        onClick={() => setActiveApplicant(index)}
                                        className={isActive ? 'nitro-gradient' : ''}
                                        style={{
                                            padding: '12px',
                                            background: isActive ? undefined : (isDark ? '#0F172A' : '#F8FAFC'),
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s ease',
                                            border: isActive ? '2px solid #fff' : '2px solid transparent'
                                        }}
                                    >
                                        <div style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center'
                                        }}>
                                            <div>
                                                <div style={{
                                                    fontWeight: 600,
                                                    fontSize: '13px',
                                                    color: isActive ? 'white' : (isDark ? '#F8FAFC' : '#020617'),
                                                    marginBottom: '2px'
                                                }}>
                                                    {applicant.name}
                                                </div>
                                                {slotInfo ? (
                                                    <div style={{
                                                        fontSize: '11px',
                                                        color: isActive ? 'rgba(255,255,255,0.9)' : (isDark ? '#94A3B8' : '#64748B')
                                                    }}>
                                                        {slotInfo.block} {slotInfo.slot.label}
                                                        {slotInfo.slot.fee && ` • $${slotInfo.slot.fee}`}
                                                    </div>
                                                ) : (
                                                    <div style={{
                                                        fontSize: '11px',
                                                        color: isActive ? 'rgba(255,255,255,0.8)' : (isDark ? '#64748B' : '#94A3B8')
                                                    }}>
                                                        No slot
                                                    </div>
                                                )}
                                            </div>

                                            {slotInfo && (
                                                <div style={{
                                                    width: '24px',
                                                    height: '24px',
                                                    background: isActive ? 'rgba(255,255,255,0.2)' : '#22C55E',
                                                    borderRadius: '50%',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    color: 'white',
                                                    fontSize: '12px'
                                                }}>
                                                    ✓
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Summary */}
                    <div className="card">
                        <h3 style={{
                            margin: '0 0 12px 0',
                            fontSize: '14px',
                            fontWeight: 600
                        }}>
                            Summary
                        </h3>

                        <div style={{ display: 'grid', gap: '10px', marginBottom: '12px' }}>
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                fontSize: '12px'
                            }}>
                                <span style={{ color: isDark ? '#94A3B8' : '#64748B' }}>Selected:</span>
                                <span style={{ fontWeight: 600 }}>
                                    {Object.keys(selectedSlots).length} / {applicants.length}
                                </span>
                            </div>

                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                fontSize: '12px',
                                paddingTop: '10px',
                                borderTop: `1px solid ${isDark ? '#334155' : '#E2E8F0'}`
                            }}>
                                <span style={{ color: isDark ? '#94A3B8' : '#64748B' }}>Total:</span>
                                <span style={{ color: 'var(--primary)', fontWeight: 700, fontSize: '16px' }}>
                                    ${calculateTotalFee().toFixed(2)}
                                </span>
                            </div>
                        </div>

                        <button
                            disabled={Object.keys(selectedSlots).length !== applicants.length}
                            className={Object.keys(selectedSlots).length === applicants.length ? 'btn-primary' : 'btn-secondary'}
                            style={{
                                width: '100%',
                                opacity: Object.keys(selectedSlots).length === applicants.length ? 1 : 0.5,
                                cursor: Object.keys(selectedSlots).length === applicants.length ? 'pointer' : 'not-allowed'
                            }}
                        >
                            {Object.keys(selectedSlots).length === applicants.length
                                ? 'Confirm Selection'
                                : `Select ${applicants.length - Object.keys(selectedSlots).length} More`
                            }
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
