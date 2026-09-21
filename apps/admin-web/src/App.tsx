import { Alert, Button, Layout, Space, Tag, Typography } from 'antd'
import './App.css'

function App() {
  return (
    <Layout className="app-shell">
      <Layout.Header className="topbar">
        <Typography.Text className="brand">Used-Book Operations</Typography.Text>
        <Space>
          <Tag color="blue">Staff</Tag>
          <Tag color="gold">Admin</Tag>
          <Tag>Test Operator</Tag>
        </Space>
      </Layout.Header>
      <Layout.Content className="content">
        <Typography.Title>Operations console</Typography.Title>
        <Typography.Paragraph className="intro">
          One workspace for moderation, disputes, withdrawals, reconciliation,
          audit records, and simulator controls. The API enforces every role
          and object-level permission.
        </Typography.Paragraph>
        <Alert
          type="info"
          showIcon
          message="Project scaffold ready"
          description="Connect authentication first, then implement role-specific queues from the reviewed OpenAPI contract."
        />
        <Space className="actions" wrap>
          <Button type="primary" href="http://localhost:3000/docs">
            Open API documentation
          </Button>
          <Button href="http://localhost:8025">Open Mailpit</Button>
          <Button href="http://localhost:9001">Open MinIO</Button>
        </Space>
      </Layout.Content>
    </Layout>
  )
}

export default App
