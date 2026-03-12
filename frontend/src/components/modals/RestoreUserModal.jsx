import React, { useState } from 'react';
import './RestoreUserModal.css';
import { Eye, EyeOff } from "lucide-react";

const RestoreUserModal = ({ isOpen, onClose, user, onUserRestored }) => {
  const [adminPassword, setAdminPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset form when modal opens/closes
  React.useEffect(() => {
    if (isOpen) {
      setAdminPassword('');
      setShowPassword(false);
      setError('');
    }
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!adminPassword.trim()) {
      setError('Administrator password is required');
      return;
    }

    setIsSubmitting(true);

    try {
      const token = localStorage.getItem('token');

      const response = await fetch(`http://localhost:5000/user-management/users/${user.user_id}/restore`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          adminPassword: adminPassword
        }),
      });

      const data = await response.json();

      if (response.ok) {
        onUserRestored(data.message || 'User restored successfully!');
        onClose();
      } else {
        setError(data.message || 'Failed to restore user');
      }
    } catch (err) {
      console.error('Restore user error:', err);
      setError('Error connecting to server');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !user) return null;

  const displayName = user.first_name && user.last_name 
    ? `${user.first_name} ${user.last_name}`
    : user.username;

  return (
    <div className="rum-modal-overlay" onClick={onClose}>
      <div className="rum-modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="rum-modal-header">
          <h2>Restore User Account</h2>
          <button 
            className="rum-modal-close" 
            onClick={onClose}
            disabled={isSubmitting}
          >
            ×
          </button>
        </div>

        <form className="rum-modal-form" onSubmit={handleSubmit}>
          {/* Success/Info Box */}
          <div className="rum-info-box">
            {/* <div className="rum-info-icon">✓</div> */}
            <div className="rum-info-content">
              <h3>Restore Account Confirmation ✅ </h3>
              <p>
                You are about to restore the account for <strong>{displayName}</strong>.
              </p>
              <p>
                This will re-activate the user's account and allow them to log in again.
              </p>
              <p className="rum-info-description">
                To confirm this action, please enter your administrator password below.
              </p>
            </div>
          </div>

          {/* Password Input Section */}
          <div className="rum-form-section">
            <div className="rum-form-section-title">Administrator Verification</div>
            <div className="rum-form-section-description">
              For security purposes, we need to verify your identity before restoring this account.
            </div>

            <div className="rum-form-group">
              <label className="rum-form-label">Your Password</label>
              <div className="rum-password-input-wrapper">
                <input
                  type={showPassword ? "text" : "password"}
                  className={`rum-form-input ${error ? 'rum-error' : ''}`}
                  placeholder="Enter your administrator password"
                  value={adminPassword}
                  onChange={(e) => {
                    setAdminPassword(e.target.value);
                    setError('');
                  }}
                  disabled={isSubmitting}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="rum-password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={isSubmitting}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              {error && <div className="rum-error-text">{error}</div>}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="rum-modal-actions">
            <button
              type="button"
              className="rum-btn rum-btn-secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rum-btn rum-btn-success"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Restoring...' : 'Restore Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RestoreUserModal;