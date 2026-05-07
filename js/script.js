document.addEventListener('DOMContentLoaded', () => {
    initMobileNav();
    initImageUpload();
    initFormValidation();
    initSmoothScroll();

    if (window.location.protocol === 'file:') {
        const path = window.location.pathname;
        const filename = path.split('/').pop() || 'index.html';
        window.location.href = `http://localhost:3000/${filename}`;
    }
});

function initMobileNav() {
    const toggle = document.getElementById('navToggle');
    const menu = document.getElementById('navMenu');
    if (toggle && menu) {
        toggle.addEventListener('click', () => {
            menu.classList.toggle('active');
            toggle.classList.toggle('active');
        });
        menu.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                menu.classList.remove('active');
                toggle.classList.remove('active');
            });
        });
    }
}

function initImageUpload() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('muzzlePhoto');
    const preview = document.getElementById('imagePreview');
    const previewImg = document.getElementById('previewImg');
    const removeBtn = document.getElementById('removeImage');

    if (!uploadArea || !fileInput) return;

    fileInput.addEventListener('change', (e) => {
        handleFile(e.target.files[0]);
    });

    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            fileInput.files = e.dataTransfer.files;
            handleFile(file);
        }
    });

    if (removeBtn) {
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            fileInput.value = '';
            preview.style.display = 'none';
            document.querySelector('.upload-label').style.display = 'flex';
        });
    }

    function handleFile(file) {
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            showFileError('File size must be less than 5MB');
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            previewImg.src = e.target.result;
            preview.style.display = 'block';
            document.querySelector('.upload-label').style.display = 'none';
            clearFileError();
        };
        reader.readAsDataURL(file);
    }

    function showFileError(msg) {
        const errEl = document.getElementById('muzzlePhotoError');
        if (errEl) {
            errEl.textContent = msg;
            errEl.style.display = 'block';
        }
    }

    function clearFileError() {
        const errEl = document.getElementById('muzzlePhotoError');
        if (errEl) {
            errEl.textContent = '';
            errEl.style.display = 'none';
        }
    }
}

function initFormValidation() {
    const form = document.getElementById('enrollForm');
    if (!form) return;

    const modal = document.getElementById('successModal');
    const closeModal = document.getElementById('closeModal');

    if (closeModal && modal) {
        closeModal.addEventListener('click', () => {
            modal.classList.remove('active');
            form.reset();
            const preview = document.getElementById('imagePreview');
            const uploadLabel = document.querySelector('.upload-label');
            if (preview) preview.style.display = 'none';
            if (uploadLabel) uploadLabel.style.display = 'flex';
        });
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        let isValid = true;

        const fields = [
            { id: 'fullName', errorId: 'fullNameError', validate: (v) => v.trim().length > 0, message: 'Name is required' },
            { id: 'email', errorId: 'emailError', validate: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), message: 'Valid email is required' },
            { id: 'phone', errorId: 'phoneError', validate: (v) => /^[\+]?[\d\s\-\(\)]{7,20}$/.test(v), message: 'Valid phone number is required' },
            { id: 'farmName', errorId: 'farmNameError', validate: (v) => v.trim().length > 0, message: 'Farm name is required' },
            { id: 'location', errorId: 'locationError', validate: (v) => v.trim().length > 0, message: 'Location is required' },
            { id: 'animalTag', errorId: 'animalTagError', validate: (v) => v.trim().length > 0, message: 'Animal tag is required' },
            { id: 'breed', errorId: 'breedError', validate: (v) => v !== '', message: 'Please select a breed' },
            { id: 'age', errorId: 'ageError', validate: (v) => v > 0 && v <= 240, message: 'Valid age is required (1-240 months)' },
            { id: 'gender', errorId: 'genderError', validate: (v) => v !== '', message: 'Please select a gender' }
        ];

        fields.forEach(field => {
            const input = document.getElementById(field.id);
            const error = document.getElementById(field.errorId);
            if (!input || !error) return;

            if (!field.validate(input.value)) {
                error.textContent = field.message;
                error.style.display = 'block';
                input.classList.add('error');
                isValid = false;
            } else {
                error.textContent = '';
                error.style.display = 'none';
                input.classList.remove('error');
            }
        });

        if (!isValid) return;

        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting...';

        try {
            const formData = new FormData();
            const formDataObj = {
                fullName: document.getElementById('fullName').value,
                email: document.getElementById('email').value,
                phone: document.getElementById('phone').value,
                farmName: document.getElementById('farmName').value,
                location: document.getElementById('location').value,
                animalTag: document.getElementById('animalTag').value,
                breed: document.getElementById('breed').value,
                age: document.getElementById('age').value,
                gender: document.getElementById('gender').value,
                weight: document.getElementById('weight').value || ''
            };

            formData.append('data', JSON.stringify(formDataObj));

            const muzzlePhotoInput = document.getElementById('muzzlePhoto');
            if (muzzlePhotoInput && muzzlePhotoInput.files.length > 0) {
                formData.append('muzzlePhoto', muzzlePhotoInput.files[0]);
            }

            const response = await fetch(window.location.origin + '/api/enroll', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success && modal) {
                modal.classList.add('active');
            } else {
                alert('Error: ' + (result.message || 'Failed to submit enrollment'));
            }
        } catch (error) {
            console.error('Submission error:', error);
            alert('Error submitting enrollment.\n\nDetails: ' + error.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Enrollment';
        }
    });

    const formInputs = document.querySelectorAll('.enroll-form input, .enroll-form select');
    formInputs.forEach(input => {
        input.addEventListener('input', () => {
            input.classList.remove('error');
            const error = document.getElementById(input.id + 'Error');
            if (error) {
                error.textContent = '';
                error.style.display = 'none';
            }
        });
    });
}

function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            const target = document.querySelector(targetId);
            if (target) {
                e.preventDefault();
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });
}
