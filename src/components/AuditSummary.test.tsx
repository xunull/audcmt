import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import AuditSummary from './AuditSummary'

describe('AuditSummary', () => {
  const mockSummary = {
    risk_level: 'high',
    network_ops: [
      { line: 10, url: 'https://example.com/script.sh', description: 'Downloads external script' }
    ],
    git_ops: [
      { line: 25, cmd: 'git clone', target: 'https://github.com/user/repo' }
    ],
    telemetry: [
      { line: 30, code: 'analytics.track()', description: 'Analytics call' }
    ],
    dangerous_patterns: [
      { line: 5, pattern: 'curl | sh', description: 'Pipe to shell execution' }
    ],
    risks: ['Downloads unsigned scripts', 'Modifies system configurations'],
    advice: 'Review the script carefully before running with elevated privileges.'
  }

  it('renders network operations', () => {
    render(<AuditSummary summary={mockSummary} />)
    expect(screen.getByText(/行 10:/)).toBeTruthy()
    expect(screen.getByText(/example\.com/)).toBeTruthy()
  })

  it('renders git operations', () => {
    render(<AuditSummary summary={mockSummary} />)
    expect(screen.getByText(/行 25:/)).toBeTruthy()
    expect(screen.getByText(/git clone/)).toBeTruthy()
  })

  it('renders dangerous patterns when present', () => {
    render(<AuditSummary summary={mockSummary} />)
    expect(screen.getByText(/危险模式/)).toBeTruthy()
    expect(screen.getByText(/curl \| sh/)).toBeTruthy()
  })

  it('renders risks as bullet points', () => {
    render(<AuditSummary summary={mockSummary} />)
    expect(screen.getByText(/Downloads unsigned scripts/)).toBeTruthy()
  })

  it('renders advice when present', () => {
    render(<AuditSummary summary={mockSummary} />)
    expect(screen.getByText(/Review the script carefully/)).toBeTruthy()
  })

  it('shows empty state for network ops when none present', () => {
    const summaryNoNetwork = {
      ...mockSummary,
      network_ops: []
    }
    render(<AuditSummary summary={summaryNoNetwork} />)
    expect(screen.getByText(/未检测到网络操作/)).toBeTruthy()
  })

  it('shows empty state for telemetry when none present', () => {
    const summaryNoTelemetry = {
      ...mockSummary,
      telemetry: []
    }
    render(<AuditSummary summary={summaryNoTelemetry} />)
    expect(screen.getByText(/未检测到遥测代码/)).toBeTruthy()
  })
})
