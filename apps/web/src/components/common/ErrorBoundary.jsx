import React from 'react';
import { Container, Card, Button } from 'react-bootstrap';

/**
 * ErrorBoundary v6 — FIX I10
 * Bắt lỗi React crash → hiển thị fallback UI thay vì màn hình trắng.
 * FIX U8: Có nút retry để user không bị kẹt.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Log lỗi — trong production nên gửi lên error tracking (Sentry...)
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Container className="d-flex justify-content-center align-items-center" style={{ minHeight: '60vh' }}>
          <Card style={{ maxWidth: 480 }} className="shadow text-center p-4">
            <div style={{ fontSize: 56 }}></div>
            <Card.Title className="mt-3">Ứng dụng gặp lỗi không mong muốn</Card.Title>
            <Card.Text className="text-muted">
              Đã xảy ra lỗi trong giao diện. Vui lòng thử tải lại trang.
            </Card.Text>
            <div className="d-flex gap-2 justify-content-center">
              <Button variant="primary" onClick={() => window.location.reload()}>
                 Tải lại trang
              </Button>
              <Button variant="outline-secondary" onClick={() => this.setState({ hasError: false, error: null })}>
                Thử lại
              </Button>
            </div>
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <pre className="text-start text-danger small mt-3 bg-light p-2 rounded" style={{ maxHeight: 200, overflow: 'auto' }}>
                {this.state.error.toString()}
              </pre>
            )}
          </Card>
        </Container>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
