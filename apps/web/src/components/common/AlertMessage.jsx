import React from 'react';
import { Alert } from 'react-bootstrap';

const AlertMessage = ({ type = 'info', message, onClose }) => {
  if (!message) return null;
  return (
    <Alert variant={type} dismissible={!!onClose} onClose={onClose} className="mb-3">
      {message}
    </Alert>
  );
};
export default AlertMessage;
