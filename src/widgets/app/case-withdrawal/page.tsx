'use client';

import { useWidgetSDK, useTheme } from '@nitrostack/widgets';

/**
 * Case Withdrawal Widget - Withdrawal confirmation with fee refund info
 *
 * TODO(visa-agent): this widget is a terminology migration of the
 * NitroStack Flight Booking OAuth template. Real Visa Agent widgets must
 * follow docs/WIDGETS.md and align case withdrawal with the Visa Case
 * Module's transition policy (see docs/ARCHITECTURE.md §14, "Withdrawn"
 * exceptional case-lifecycle path).
 */

interface WithdrawalData {
    caseId: string;
    withdrawalId: string;
    status: string;
    feeRefundAmount?: string;
    feeRefundCurrency?: string;
    confirmedAt: string;
    message: string;
}

export default function CaseWithdrawal() {
    const { getToolOutput } = useWidgetSDK();
    const theme = useTheme();
    const data = getToolOutput<WithdrawalData>();

    const isDark = theme === 'dark';

    const formatDateTime = (isoString: string) => {
        return new Date(isoString).toLocaleString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    if (!data) {
        return <div style={{ padding: '24px', textAlign: 'center' }}>Loading...</div>;
    }

    const hasRefund = data.feeRefundAmount && parseFloat(data.feeRefundAmount) > 0;

    return (
        <div className={isDark ? 'dark' : ''} style={{
            padding: '24px',
            background: isDark ? '#020617' : '#FFFFFF',
            color: isDark ? '#F8FAFC' : '#020617',
            minHeight: '300px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        }}>
            <div style={{ maxWidth: '550px', width: '100%' }}>
                {/* Icon */}
                <div style={{
                    width: '100px',
                    height: '100px',
                    margin: '0 auto 24px',
                    background: hasRefund
                        ? 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)'
                        : 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: hasRefund
                        ? '0 8px 24px rgba(245, 158, 11, 0.3)'
                        : '0 8px 24px rgba(239, 68, 68, 0.3)'
                }}>
                    <div style={{ fontSize: '48px', color: 'white' }}>
                        {hasRefund ? '💰' : '✗'}
                    </div>
                </div>

                {/* Title */}
                <h2 style={{ margin: '0 0 12px 0', fontSize: '24px', fontWeight: 700, textAlign: 'center' }}>
                    Case Withdrawn
                </h2>

                <p style={{ margin: '0 0 24px 0', fontSize: '14px', color: isDark ? '#94A3B8' : '#64748B', lineHeight: '1.6', textAlign: 'center' }}>
                    {data.message}
                </p>

                {/* Withdrawal Details */}
                <div style={{
                    background: isDark ? '#0F172A' : '#F8FAFC',
                    borderRadius: '12px',
                    padding: '20px',
                    marginBottom: '20px',
                    border: `1px solid ${isDark ? '#334155' : '#E2E8F0'}`
                }}>
                    <div style={{ display: 'grid', gap: '16px' }}>
                        {/* Case ID */}
                        <div>
                            <div style={{ fontSize: '11px', color: isDark ? '#94A3B8' : '#64748B', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                Case ID
                            </div>
                            <div style={{ fontSize: '14px', fontWeight: 600, fontFamily: 'monospace', padding: '10px', background: isDark ? '#020617' : 'white', borderRadius: '6px' }}>
                                {data.caseId}
                            </div>
                        </div>

                        {/* Withdrawal ID */}
                        <div>
                            <div style={{ fontSize: '11px', color: isDark ? '#94A3B8' : '#64748B', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                Withdrawal Reference
                            </div>
                            <div style={{ fontSize: '14px', fontWeight: 600, fontFamily: 'monospace', padding: '10px', background: isDark ? '#020617' : 'white', borderRadius: '6px' }}>
                                {data.withdrawalId}
                            </div>
                        </div>

                        {/* Withdrawn On */}
                        <div>
                            <div style={{ fontSize: '11px', color: isDark ? '#94A3B8' : '#64748B', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                Withdrawn On
                            </div>
                            <div style={{ fontSize: '13px', fontWeight: 600, padding: '10px', background: isDark ? '#020617' : 'white', borderRadius: '6px' }}>
                                {formatDateTime(data.confirmedAt)}
                            </div>
                        </div>

                        {/* Refund Information */}
                        {hasRefund ? (
                            <div style={{
                                marginTop: '8px',
                                padding: '16px',
                                background: '#FEF3C7',
                                borderRadius: '8px',
                                border: '1px solid #F59E0B'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                                    <div style={{ fontSize: '28px' }}>💰</div>
                                    <div>
                                        <div style={{ fontSize: '12px', color: '#92400E', fontWeight: 600, marginBottom: '4px' }}>
                                            Refund Amount
                                        </div>
                                        <div style={{ fontSize: '22px', fontWeight: 700, color: '#78350F' }}>
                                            {data.feeRefundCurrency} {parseFloat(data.feeRefundAmount!).toFixed(2)}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ fontSize: '11px', color: '#92400E', lineHeight: '1.5' }}>
                                    Refund will be processed to your original fee payment method within 5-10 business days.
                                </div>
                            </div>
                        ) : (
                            <div style={{
                                marginTop: '8px',
                                padding: '16px',
                                background: '#FEE2E2',
                                borderRadius: '8px',
                                border: '1px solid #EF4444'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <div style={{ fontSize: '20px' }}>ℹ️</div>
                                    <div style={{ fontSize: '12px', color: '#991B1B', lineHeight: '1.5' }}>
                                        <strong>No Refund Available:</strong> This case fee was non-refundable or outside the withdrawal window.
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Status Badge */}
                <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                    <div className="badge badge-error" style={{ padding: '10px 20px', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        ✗ {data.status}
                    </div>
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'grid', gap: '10px' }}>
                    <button className="btn-primary" style={{ width: '100%' }}>
                        🔍 Search New Pathways
                    </button>
                    <button className="btn-secondary" style={{ width: '100%' }}>
                        📧 Email Confirmation
                    </button>
                    <button className="btn-secondary" style={{ width: '100%' }}>
                        📄 Download Receipt
                    </button>
                </div>

                {/* Help Section */}
                <div style={{
                    marginTop: '20px',
                    padding: '16px',
                    background: isDark ? '#0F172A' : '#F8FAFC',
                    borderRadius: '8px',
                    border: `1px solid ${isDark ? '#334155' : '#E2E8F0'}`
                }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>💬</span>
                        <span>Need Help?</span>
                    </div>
                    <div style={{ fontSize: '11px', color: isDark ? '#94A3B8' : '#64748B', lineHeight: '1.5', marginBottom: '10px' }}>
                        Questions about this withdrawal? Contact our support team 24/7.
                    </div>
                    <button className="btn-primary" style={{ padding: '8px 16px', fontSize: '12px' }}>
                        Contact Support
                    </button>
                </div>
            </div>
        </div>
    );
}
