// ============================================
// VALIDATION UTILITIES
// ============================================

export const validateName = (value, fieldName, required = true) => {
  if (required && (!value || value.trim().length === 0)) {
    return `${fieldName} is required`;
  }
  
  if (value && value.trim().length > 0) {
    const trimmed = value.trim();
    
    if (trimmed.length < 2 || trimmed.length > 50) {
      return `${fieldName} must be 2-50 characters`;
    }
    
    const namePattern = /^[A-Za-zÑñ\s'-]{2,50}$/;
    if (!namePattern.test(trimmed)) {
      return `${fieldName} must contain only letters`;
    }
  }
  
  return null;
};

export const validateAddress = (value, fieldName, minLength = 5, maxLength = 200) => {
  if (!value || value.trim().length === 0) {
    return `${fieldName} is required`;
  }
  
  if (value.length < minLength || value.length > maxLength) {
    return `${fieldName} must be ${minLength}-${maxLength} characters`;
  }
  
  const addressPattern = /^[A-Za-z0-9ÑñĆ.,\s-]{5,200}$/;
  if (!addressPattern.test(value)) {
    return `${fieldName} contains invalid characters`;
  }
  
  return null;
};

export const validatePhone = (value, required = false) => {
  if (required && (!value || value.trim().length === 0)) {
    return "Contact number is required";
  }
  
  if (value && value.trim().length > 0) {
    const cleaned = value.replace(/[\s-]/g, '');
    const phonePattern = /^(09|\+639)\d{9}$/;
    
    if (!phonePattern.test(cleaned)) {
      return "Please enter a valid Philippine mobile number (11 digits starting with 09)";
    }
  }
  
  return null;
};

export const validateRequired = (value, fieldName) => {
  if (!value || (typeof value === 'string' && value.trim().length === 0)) {
    return `${fieldName} is required`;
  }
  return null;
};

export const validateAge = (value) => {
  if (value) {
    const age = parseInt(value);
    if (isNaN(age) || age < 10 || age > 120) {
      return "Age must be between 10 and 120";
    }
  }
  return null;
};

export const validateHeight = (value) => {
  if (value) {
    const height = parseInt(value);
    if (isNaN(height) || height < 50 || height > 250) {
      return "Height must be between 50-250 cm";
    }
  }
  return null;
};

export const validateBirthday = (value) => {
  if (value) {
    const birthDate = new Date(value);
    const today = new Date();
    const age = today.getFullYear() - birthDate.getFullYear();
    
    if (birthDate > today) {
      return "Birthday cannot be in the future";
    }
    
    if (age < 10) {
      return "Suspect must be at least 10 years old";
    }
  }
  return null;
};

export const validateNarrative = (value) => {
  if (!value || value.trim().length === 0) {
    return "Narrative is required";
  }
  
  if (value.length < 20) {
    return "Narrative must be at least 20 characters";
  }
  
  if (value.length > 5000) {
    return "Narrative must not exceed 5000 characters";
  }
  
  return null;
};

export const validateDateRange = (commissionDate, reportDate) => {
  const errors = {};
  
  if (!commissionDate) {
    errors.commission = "Date & Time of Commission is required";
  }
  
  if (!reportDate) {
    errors.report = "Date & Time Reported is required";
  }
  
  if (commissionDate && reportDate) {
    const commission = new Date(commissionDate);
    const reported = new Date(reportDate);
    const now = new Date();
    
    if (commission > now) {
      errors.commission = "Commission date cannot be in the future";
    }
    
    if (reported > now) {
      errors.report = "Report date cannot be in the future";
    }
    
    if (commission > reported) {
      errors.commission = "Commission date cannot be after report date";
    }
  }
  
  return errors;
};

// ============================================
// FIELD ERROR COMPONENT
// ============================================

export const FieldError = ({ error }) => {
  if (!error) return null;
  return <span className="eb-field-error">{error}</span>;
};