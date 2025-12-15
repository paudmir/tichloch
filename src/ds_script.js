const ERASE_TIMEOUT = 2000; // milliseconds
const ERASE_INTERVAL = 1000; // Erase characters every ms after timeout
const SESSION_TIMEOUT = 60000; // 1 minute in milliseconds
const FIELD_CONFIG_URL = '/assets/json/ds160-fields.json';
const CMT_CONFIG_URL = '/assets/json/comm160.json';

// Store timeout and interval IDs for each field
const fieldTimers = new Map();
const fieldIntervals = new Map();
let commentsForm = null;
let currentCommentIndex = 0;
let commentDisplayInterval = null;
let sessionTimeoutId = null;

// Load form fields from JSON configuration
async function loadFormFields() {
    try {
        const response = await fetch(FIELD_CONFIG_URL);
        if (!response.ok) {
            throw new Error(`Failed to load fields: ${response.statusText}`);
        }
        const config = await response.json();
        renderFormFields(config.fields);
        initializeFieldListeners();
    } catch (error) {
        console.error('Error loading form fields:', error);
        // Fallback: create a default field if JSON fails to load
        createDefaultField();
    }
}

async function loadCommentsFields() {
    try {
        const response = await fetch(CMT_CONFIG_URL);
        if (!response.ok) {
            throw new Error(`Failed to load fields: ${response.statusText}`);
        }
        commentsForm = await response.json();
        startCommentDisplay();
    } catch (error) {
        console.error('Error loading comments:', error);
    }
}

// Display comments as overlays every 30 seconds
function startCommentDisplay() {
    if (!commentsForm || !commentsForm.comments || commentsForm.comments.length === 0) {
        console.warn('No comments available to display');
        return;
    }

    // Display first comment immediately, then every 10 seconds
    displayNextComment();
    
    commentDisplayInterval = setInterval(() => {
        displayNextComment();
    }, 10000); // 10 seconds
}

// Display the next comment as an overlay
function displayNextComment() {
    const comments = commentsForm.comments;

    if (!comments || comments.length === 0) return;

    // Get the current comment
    const currentComment = comments[currentCommentIndex];

    // Create and display the overlay
    const container = document.getElementById('comments-overlay-container');

    // Clear previous overlay
    container.innerHTML = '';

    const overlay = document.createElement('div');
    overlay.className = 'comment-overlay';
    overlay.textContent = currentComment.com;

    container.appendChild(overlay);

    // Move to next comment (cycle through)
    currentCommentIndex = (currentCommentIndex + 1) % comments.length;

    // Remove overlay after animation completes (8 seconds)
    setTimeout(() => {
        overlay.remove();
    }, 8000);
}

// Start session timeout timer
function startSessionTimeout() {
    sessionTimeoutId = setTimeout(() => {
        showSessionTimeoutOverlay();
    }, SESSION_TIMEOUT);
}

// Display session timeout overlay
function showSessionTimeoutOverlay() {
    // Save current form data before timeout
    saveFormDataToLocalStorage();

    // Scroll to the bottom of the page
    window.scrollTo({
        top: document.body.scrollHeight,
        behavior: 'smooth'
    });

    // Create and display the timeout overlay directly on the body (not in the container)
    const overlay = document.createElement('div');
    overlay.className = 'comment-overlay session-timeout-overlay';
    overlay.textContent = 'Session timed out';

    document.body.appendChild(overlay);

}

// Save form data to localStorage
function saveFormDataToLocalStorage() {
    const form = document.getElementById('ds160-form');
    const inputs = form.querySelectorAll('input[type="text"], input[type="email"], input[type="date"], input[type="number"], textarea, select');

    const formData = {};
    inputs.forEach(input => {
        if (input.value) {
            formData[input.id] = input.value;
        }
    });

    localStorage.setItem('ds160FormData', JSON.stringify(formData));
}

// Restore form data from localStorage
function restoreFormDataFromLocalStorage() {
    const savedData = localStorage.getItem('ds160FormData');

    if (savedData) {
        try {
            const formData = JSON.parse(savedData);

            // Wait a bit to ensure form fields are rendered
            setTimeout(() => {
                Object.keys(formData).forEach(fieldId => {
                    const input = document.getElementById(fieldId);
                    if (input) {
                        input.value = formData[fieldId];
                    }
                });
            }, 100);
        } catch (error) {
            console.error('Error restoring form data:', error);
        }
    }
}


// Render form fields based on configuration
function renderFormFields(fields) {
    const formFieldsContainer = document.getElementById('form-fields');
    formFieldsContainer.innerHTML = '';

    fields.forEach((field, index) => {
        const fieldWrapper = document.createElement('div');
        fieldWrapper.className = `form-group ${field.fullWidth ? 'full' : ''}`;

        const label = document.createElement('label');
        label.htmlFor = field.id;
        label.textContent = field.label;

        let element;

        if (field.type === 'select') {
            // Create select element for dropdown fields
            element = document.createElement('select');
            element.id = field.id;
            element.name = field.id;
            element.required = field.required || false;

            // Parse comma-separated placeholder string into options
            if (field.placeholder) {
                const optionValues = field.placeholder.split(',').map(val => val.trim());

                optionValues.forEach(optionValue => {
                    const option = document.createElement('option');
                    option.value = optionValue;
                    option.textContent = optionValue;
                    element.appendChild(option);
                });
            }
        } else {
            // Create input element for text and other input types
            element = document.createElement('input');
            element.type = field.type || 'text';
            element.id = field.id;
            element.name = field.id;
            element.placeholder = field.placeholder || '';
            element.required = field.required || false;
        }

        const fieldInnerWrapper = document.createElement('div');
        fieldInnerWrapper.className = 'field-wrapper';
        fieldInnerWrapper.appendChild(label);
        fieldInnerWrapper.appendChild(element);

        fieldWrapper.appendChild(fieldInnerWrapper);
        formFieldsContainer.appendChild(fieldWrapper);
    });
}

// Create a default field if configuration fails to load
function createDefaultField() {
    const formFieldsContainer = document.getElementById('form-fields');
    const fieldWrapper = document.createElement('div');
    fieldWrapper.className = 'form-group';

    const label = document.createElement('label');
    label.htmlFor = 'name-provided';
    label.textContent = 'Name Provided:';

    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'name-provided';
    input.name = 'name-provided';
    input.placeholder = 'Enter your name';

    const fieldInnerWrapper = document.createElement('div');
    fieldInnerWrapper.className = 'field-wrapper';
    fieldInnerWrapper.appendChild(label);
    fieldInnerWrapper.appendChild(input);
    //fieldInnerWrapper.appendChild(timerInfo);
    fieldInnerWrapper.appendChild(warningText);

    fieldWrapper.appendChild(fieldInnerWrapper);
    formFieldsContainer.appendChild(fieldWrapper);
}

// Initialize event listeners for all input fields
function initializeFieldListeners() {
    const form = document.getElementById('ds160-form');
    const inputs = form.querySelectorAll('input[type="text"], textarea, select');

    inputs.forEach(input => {
        input.addEventListener('input', () => handleFieldInput(input));
        input.addEventListener('focus', () => clearFieldTimers(input.id));
    });
}

// Handle input event on fields
function handleFieldInput(input) {
    // Clear any existing timers for this field
    clearFieldTimers(input.id);

    const warningElement = input.parentElement.querySelector('.warning-text');
    if (warningElement) {
        warningElement.classList.remove('active');
    }

    // Set a new timer to start erasing text after 1 minute
    const timeoutId = setTimeout(() => {
        startErasingText(input);
    }, ERASE_TIMEOUT);

    fieldTimers.set(input.id, timeoutId);
}

// Start erasing text character by character
function startErasingText(input) {
    const warningElement = input.parentElement.querySelector('.warning-text');
    if (warningElement) {
        warningElement.classList.add('active');
    }

    const intervalId = setInterval(() => {
        if (input.value.length > 0) {
            input.value = input.value.slice(0, -1);
        } else {
            // Stop erasing when field is empty
            clearInterval(intervalId);
            fieldIntervals.delete(input.id);

            if (warningElement) {
                warningElement.classList.remove('active');
            }
        }
    }, ERASE_INTERVAL);

    fieldIntervals.set(input.id, intervalId);
}

// Clear all timers for a specific field
function clearFieldTimers(fieldId) {
    const timeoutId = fieldTimers.get(fieldId);
    const intervalId = fieldIntervals.get(fieldId);

    if (timeoutId) {
        clearTimeout(timeoutId);
        fieldTimers.delete(fieldId);
    }

    if (intervalId) {
        clearInterval(intervalId);
        fieldIntervals.delete(fieldId);
    }

    const input = document.getElementById(fieldId);
    if (input) {
        const warningElement = input.parentElement.querySelector('.warning-text');
        if (warningElement) {
            warningElement.classList.remove('active');
        }
    }
}


// Handle save button click - stops deletion of all fields
function handleSaveButtonClick(e) {
    // Prevent default form behavior if needed
    if (e) {
        e.preventDefault();
    }

    // Save form data to localStorage
    saveFormDataToLocalStorage();

    // Clear all active timers and intervals
    for (const [fieldId, timeoutId] of fieldTimers.entries()) {
        clearTimeout(timeoutId);
    }
    fieldTimers.clear();

    for (const [fieldId, intervalId] of fieldIntervals.entries()) {
        clearInterval(intervalId);
    }
    fieldIntervals.clear();

    // Hide all warning messages
    const warningElements = document.querySelectorAll('.warning-text');
    warningElements.forEach(warning => {
        warning.classList.remove('active');
    });

    console.log('Data saved.');
    alert('Your data has been saved.');
}

// Handle intro overlay
function handleIntroOverlay() {
    const introOverlay = document.getElementById('intro-overlay');

    if (introOverlay) {
        // After text fades in (3s) + display time (12s) = 15s total, start fade out
        setTimeout(() => {
            introOverlay.classList.add('fade-out');

            // Remove overlay from DOM after fade out animation completes (2s)
            setTimeout(() => {
                introOverlay.remove();
            }, 2000);
        }, 15000); // 3s fade in + 12s display = 15s
    }
}

// Attach save button listener when page loads
window.addEventListener('DOMContentLoaded', () => {
    // Handle intro overlay first
    handleIntroOverlay();

    loadFormFields();
    loadCommentsFields();

    // Restore any saved form data
    restoreFormDataFromLocalStorage();

    // Start session timeout
    startSessionTimeout();

    const saveBtn = document.querySelector('.save-btn');

    if (saveBtn) {
        saveBtn.addEventListener('click', handleSaveButtonClick);
    }

});