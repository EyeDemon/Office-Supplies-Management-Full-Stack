import React from 'react';
import { Modal as BsModal } from 'react-bootstrap';

const Modal = ({ show = true, title, onClose, size = 'md', children }) => (
  <BsModal show={show} onHide={onClose} centered size={size} backdrop="static">
    {title && (
      <BsModal.Header closeButton>
        <BsModal.Title className="fs-5">{title}</BsModal.Title>
      </BsModal.Header>
    )}
    <BsModal.Body>
      {children}
    </BsModal.Body>
  </BsModal>
);

export default Modal;
